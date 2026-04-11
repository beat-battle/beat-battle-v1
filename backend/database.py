"""
SQLAlchemy engine and session factory for CookUp accounts.

- **Local dev:** leave ``DATABASE_URL`` unset to use SQLite at ``<project_root>/cookup.db``.
- **Production (Render Postgres):** set ``DATABASE_URL`` to the **Internal Database URL**
  from your Render Postgres dashboard (or link the DB so Render injects it). Never commit
  credentials; set them only in the Render dashboard or a local ``.env`` (gitignored).

If you see **password authentication failed**, the URL on the Web Service does not match
the database user/password (stale env after a password reset, typo, or extra quotes/spaces).
Copy the Internal URL again from the Postgres service, or reset the DB password and update
``DATABASE_URL``. Use the **internal** URL for the web service on Render, not the external host.
"""

from __future__ import annotations

import os
from pathlib import Path

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
    """Render internal URLs often omit ``:5432``; set explicitly for reliable connects."""
    try:
        u = make_url(url)
    except Exception:
        return url
    if u.get_backend_name() != "postgresql":
        return url
    if u.port is not None:
        return url
    return str(u.set(port=5432))


def resolve_database_url() -> str:
    raw = _strip_database_url_env(os.environ.get("DATABASE_URL", ""))
    if raw:
        url = _normalize_postgres_url(raw)
        return _ensure_postgres_default_port(url)
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
