"""Optional static ``KIT_MANIFEST_PATH`` overrides disk scan."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.generator import _LIGHT_KIT_KEYS
from backend import kit_manifest as km


def _minimal_manifest(keys_extra: dict | None = None) -> dict:
    keys: dict[str, list[str]] = {k: [] for k in _LIGHT_KIT_KEYS}
    if keys_extra:
        keys.update(keys_extra)
    return {"version": 5, "sampleRate": 44100, "keys": keys}


@pytest.fixture(autouse=True)
def clear_manifest_cache():
    km.get_kit_manifest_cached.cache_clear()
    yield
    km.get_kit_manifest_cached.cache_clear()


def test_kit_manifest_path_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "kit-manifest.json"
    path.write_text(
        json.dumps(
            _minimal_manifest(
                {
                    "snare": ["trap/snares/x.ogg"],
                    "synth1": ["trap/synths/a.ogg"],
                    "synth2": ["trap/synths/a.ogg"],
                    "synth3": ["trap/synths/a.ogg"],
                },
            ),
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("KIT_MANIFEST_PATH", str(path))
    km.get_kit_manifest_cached.cache_clear()
    data = km.get_kit_manifest_cached()
    assert data["keys"]["snare"] == ["trap/snares/x.ogg"]
    assert data["keys"]["synth1"] == ["trap/synths/a.ogg"]


def test_kit_manifest_invalid_json_falls_back(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    path = tmp_path / "bad.json"
    path.write_text("{not json", encoding="utf-8")
    monkeypatch.setenv("KIT_MANIFEST_PATH", str(path))
    km.get_kit_manifest_cached.cache_clear()
    # Should not raise; falls back to disk scan
    data = km.get_kit_manifest_cached()
    assert "keys" in data
    assert isinstance(data["keys"], dict)
