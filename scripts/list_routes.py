"""
Print FastAPI route paths and methods (project root: python scripts/list_routes.py).

Mounts (e.g. static /) are listed with their path prefix; WebSocket routes show as WS.
"""

from __future__ import annotations

import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from backend.main import app  # noqa: E402


def main() -> None:
    rows: list[tuple[str, str]] = []
    for route in app.routes:
        path = getattr(route, "path", "") or ""
        methods = getattr(route, "methods", None)
        name = type(route).__name__
        if methods:
            ms = sorted(m for m in methods if m != "HEAD")
            rows.append(("|".join(ms) if ms else "GET", path))
        elif name == "WebSocketRoute" or "WebSocket" in name:
            rows.append(("WS", path))
        elif name == "Mount":
            display = path if path else "/"
            rows.append(("MOUNT", display))
        else:
            rows.append((name, path))

    rows.sort(key=lambda x: (x[1], x[0]))
    w = max(len(m) for m, _ in rows) if rows else 10
    for methods, path in rows:
        print(f"{methods:{w}}  {path}")


if __name__ == "__main__":
    main()
