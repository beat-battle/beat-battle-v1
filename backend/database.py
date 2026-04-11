"""
SQLAlchemy engine and session factory for CookUp accounts.

- **Local dev:** leave ``DATABASE_URL`` unset → SQLite at ``<project_root>/cookup.db``.

- **Production (Neon, neon.tech):** in the Neon dashboard, copy the
  **connection string** (``postgresql://…``). Set ``DATABASE_URL`` on your host (e.g. Render
  Web Service **Environment**). Neon requires TLS; if your string omits it, we append
  ``sslmode=require`` for ``*.neon.tech`` hosts. Never commit secrets.

- **Split env vars** (optional, avoids fragile pasted URLs): ``COOKUP_DB_HOST``,
  ``COOKUP_DB_USER``, ``COOKUP_DB_PASSWORD``, ``COOKUP_DB_NAME``, optional ``COOKUP_DB_PORT``.
  Set ``COOKUP_DB_USE_SPLIT=1`` to prefer these over ``DATABASE_URL`` when both exist.

- **Force SSL** for any Postgres host: ``COOKUP_PG_REQUIRE_SSL=1`` (adds ``sslmode=require``
  when not already in the URL).

Auth errors almost always mean wrong user/password in env or an expired/rotated password—
update values in Neon (or your provider) and redeploy.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote, quote_plus

from sqlalchemy import create_engine, event
from sqlalchemy.engine.url import make_url
from collections.abc import Generator

from sqlalchemy.orm import Session, declarative_base, sessionmaker

_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _strip_database_url_env(raw: str) -> str:
    """Trim whitespace and one pair of surrounding quotes (common copy-paste mistake in Render UI)."""
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1].strip()
    return s


def _default_sqlite_url() -> str:
    p = (_PROJECT_ROOT / "cookup.db").resolve()
    return f"sqlite:///{p.as_posix()}"


def _normalize_postgres_url(url: str) -> str:
    """Render supplies ``postgresql://``; use psycopg v3 driver (wheels on modern Python)."""
    try:
        u = make_url(url)
    except Exception:
        return url
    if u.get_backend_name() != "postgresql":
        return url
    if "psycopg" in u.drivername:
        return url
    return str(u.set(drivername="postgresql+psycopg"))


def _ensure_postgres_default_port(url: str) -> str:
    """Internal URLs sometimes omit ``:5432``; set explicitly when missing."""
    try:
        u = make_url(url)
    except Exception:
        return url
    if u.get_backend_name() != "postgresql":
        return url
    if u.port is not None:
        return url
    return str(u.set(port=5432))


def _ensure_postgres_sslmode(url: str) -> str:
    """Neon and many cloud Postgres providers require TLS (``sslmode=require``)."""
    try:
        u = make_url(url)
    except Exception:
        return url
    if u.get_backend_name() != "postgresql":
        return url
    host = (u.host or "").lower()
    q = dict(u.query)
    keys_lower = {k.lower() for k in q}
    if "sslmode" in keys_lower or "ssl" in keys_lower:
        return url
    require = os.environ.get("COOKUP_PG_REQUIRE_SSL", "").strip().lower() in ("1", "true", "yes")
    if "neon.tech" in host or require:
        merged = {**q, "sslmode": "require"}
        return str(u.set(query=merged))
    return url


def _finalize_postgres_url(url: str) -> str:
    url = _ensure_postgres_default_port(url)
    url = _ensure_postgres_sslmode(url)
    return url


def _database_url_from_split_env() -> str:
    """Build a Postgres URL with proper encoding (avoids broken passwords in pasted URLs)."""
    host = os.environ.get("COOKUP_DB_HOST", "").strip()
    user = os.environ.get("COOKUP_DB_USER", "").strip()
    password = os.environ.get("COOKUP_DB_PASSWORD", "").strip()
    database = os.environ.get("COOKUP_DB_NAME", "").strip()
    if not (host and user and password and database):
        return ""
    port = os.environ.get("COOKUP_DB_PORT", "5432").strip() or "5432"
    u = quote_plus(user)
    p = quote_plus(password)
    d = quote(database, safe="")
    return f"postgresql://{u}:{p}@{host}:{port}/{d}"


def _use_split_db_over_url() -> bool:
    return os.environ.get("COOKUP_DB_USE_SPLIT", "").strip().lower() in ("1", "true", "yes")


def resolve_database_url() -> str:
    split_raw = _database_url_from_split_env()
    db_url_raw = _strip_database_url_env(os.environ.get("DATABASE_URL", ""))
    use_split_first = _use_split_db_over_url() and bool(split_raw)

    if use_split_first:
        url = _normalize_postgres_url(split_raw)
        return _finalize_postgres_url(url)
    if db_url_raw:
        url = _normalize_postgres_url(db_url_raw)
        return _finalize_postgres_url(url)
    if split_raw:
        url = _normalize_postgres_url(split_raw)
        return _finalize_postgres_url(url)
    return _default_sqlite_url()


def _ensure_sqlite_parent_dir(database_url: str) -> None:
    """Create parent directory for file-based SQLite before the engine opens the file."""
    try:
        u = make_url(database_url)
    except Exception:
        return
    if u.get_backend_name() != "sqlite":
        return
    db = u.database
    if not db or db == ":memory:" or db.startswith("file::memory:"):
        return
    path = Path(db)
    if not path.is_absolute():
        path = (_PROJECT_ROOT / path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)


DATABASE_URL = resolve_database_url()
_ensure_sqlite_parent_dir(DATABASE_URL)


def _create_engine():
    url = DATABASE_URL
    kwargs: dict = {"pool_pre_ping": True}
    try:
        parsed = make_url(url)
        backend = parsed.get_backend_name()
    except Exception:
        backend = "sqlite"
        parsed = None
    if backend == "sqlite":
        kwargs["connect_args"] = {"check_same_thread": False}
    elif backend == "postgresql":
        kwargs["connect_args"] = {"connect_timeout": 15}
        if parsed.host and "neon.tech" in parsed.host.lower():
            # Serverless Postgres: drop stale connections before the platform does
            kwargs["pool_recycle"] = 300
    return create_engine(url, **kwargs)


engine = _create_engine()


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, connection_record) -> None:
    """SQLite only: WAL and busy timeout. Postgres connections skip this."""
    if connection_record.dialect.name != "sqlite":
        return
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if missing."""
    from . import models  # noqa: F401 — register models

    Base.metadata.create_all(bind=engine)
