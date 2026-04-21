"""
Reset a user's password from the shell (same hashing as the app).

Run from project root::

    python -m backend.scripts.reset_password USERNAME NEW_PASSWORD

Loads ``.env`` from the project root. Does not print the new password.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException

_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_ROOT / ".env")


def main() -> None:
    parser = argparse.ArgumentParser(description="Set a user's password (bcrypt).")
    parser.add_argument("username", help="Account username (case-insensitive match)")
    parser.add_argument("new_password", help="New password (min 8 characters)")
    args = parser.parse_args()

    if len(args.new_password) < 8:
        print("Error: new_password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    from backend.auth import reset_user_password_for_username
    from backend.database import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        user = reset_user_password_for_username(
            db, username=args.username, new_password=args.new_password
        )
    except HTTPException as exc:
        print(exc.detail, file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()

    print(f"Updated password for user_id={user.id} username={user.username!r}")


if __name__ == "__main__":
    main()
