"""JWT password version (``pv``) invalidates sessions after admin password reset."""

from __future__ import annotations

from types import SimpleNamespace

from backend.auth import token_password_version_matches


def test_token_password_version_matches_legacy_missing_pv() -> None:
    user = SimpleNamespace(password_version=0)
    assert token_password_version_matches(user, {"sub": "1", "username": "x"})
    assert not token_password_version_matches(user, {"pv": 1})


def test_token_password_version_matches_after_reset() -> None:
    user = SimpleNamespace(password_version=2)
    assert token_password_version_matches(user, {"pv": 2})
    assert not token_password_version_matches(user, {"pv": 1})
    assert not token_password_version_matches(user, {})


def test_token_password_version_bad_claim() -> None:
    user = SimpleNamespace(password_version=0)
    assert not token_password_version_matches(user, {"pv": "nope"})
