"""Pytest hooks: disable default remote kit manifest fetch for deterministic tests."""

from __future__ import annotations

import os


def pytest_configure(config) -> None:  # noqa: ARG001
    # When unset, production uses the CDN URL in kit_manifest; tests set empty to force disk/file only.
    os.environ.setdefault("KIT_MANIFEST_URL", "")
    os.environ.setdefault("KIT_MANIFEST_EDM_URL", "")
