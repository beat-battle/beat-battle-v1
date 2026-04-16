"""
Build ``/api/kit-manifest`` payload: sorted media paths per logical kit key (matches client kit build).

Resolution order for :func:`get_kit_manifest_cached`:

1. ``KIT_MANIFEST_PATH`` — local JSON file (e.g. from ``misc/scripts/build_kit_manifest_from_r2.py``).
2. ``KIT_MANIFEST_URL`` — HTTP(S) JSON. If the variable is **unset**, defaults to the production CDN
   ``https://assets.beat-battle.net/kit-manifest.json``. Set ``KIT_MANIFEST_URL=`` (empty) to skip and use disk.
3. Scan ``dataset/trap/`` on disk.
"""

from __future__ import annotations

import json
import os
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Any

from .audio_utils import list_dataset_samples_in_dir
from .generator import (
    DATASET_ROOT,
    CATEGORY_FOLDERS,
    _LIGHT_KIT_KEYS,
    trap_synth_samples_dir,
)

_PROJECT_ROOT = DATASET_ROOT.parent

_DEFAULT_KIT_MANIFEST_URL = "https://assets.beat-battle.net/kit-manifest.json"


def _configured_kit_manifest_path() -> Path | None:
    raw = os.environ.get("KIT_MANIFEST_PATH", "").strip()
    if not raw:
        return None
    p = Path(raw)
    return p if p.is_absolute() else _PROJECT_ROOT / p


def _remote_kit_manifest_url() -> str | None:
    """Explicit ``KIT_MANIFEST_URL=`` disables remote; unset uses CDN default."""
    if "KIT_MANIFEST_URL" in os.environ:
        v = os.environ["KIT_MANIFEST_URL"].strip()
        return v or None
    return _DEFAULT_KIT_MANIFEST_URL


def _validate_manifest_payload(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or "keys" not in data:
        raise ValueError("Invalid kit manifest JSON: missing top-level 'keys'")
    keys = data["keys"]
    if not isinstance(keys, dict):
        raise ValueError("Invalid kit manifest JSON: 'keys' must be an object")
    for k in _LIGHT_KIT_KEYS:
        if k not in keys or not isinstance(keys[k], list):
            raise ValueError(
                f"Invalid kit manifest JSON: missing or non-array keys[{k!r}]"
            )
    return data


def _load_kit_manifest_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return _validate_manifest_payload(data)


def _load_kit_manifest_from_url(url: str) -> dict[str, Any]:
    import urllib.error
    import urllib.request

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BeatBattleKitManifest/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
    data = json.loads(raw.decode("utf-8"))
    return _validate_manifest_payload(data)


def _samples_sorted(d: Path) -> list[Path]:
    if not d.is_dir():
        return []
    try:
        return list_dataset_samples_in_dir(d)
    except ValueError:
        return []


def _dataset_dir(logical: str) -> Path:
    """Samples live under ``dataset/trap/<category>/`` (same keys as R2)."""
    name = CATEGORY_FOLDERS[logical]
    trap = DATASET_ROOT / "trap"
    p = trap / name
    if p.is_dir():
        return p
    if logical == "open_hat" and (trap / "open_hihats").is_dir():
        return trap / "open_hihats"
    return p


def _rel_media_path(path: Path) -> str:
    """Path relative to ``dataset/`` using forward slashes."""
    rel = path.relative_to(DATASET_ROOT)
    return rel.as_posix()


def build_kit_manifest() -> dict[str, Any]:
    """
    Keys: logical stem → sorted list of relative paths under ``dataset/``.
    Order of keys follows ``_LIGHT_KIT_KEYS`` for documentation; clients use logical names.
    """
    out: dict[str, list[str]] = {}

    static_keys = [k for k in _LIGHT_KIT_KEYS if not k.startswith("synth")]
    for logical in static_keys:
        d = _dataset_dir(logical)
        samples = _samples_sorted(d)
        out[logical] = [_rel_media_path(p) for p in samples]

    synth_dir = trap_synth_samples_dir()
    synth_samples = _samples_sorted(synth_dir)
    synth_rel = [_rel_media_path(p) for p in synth_samples]

    for stem in ("synth1", "synth2", "synth3"):
        out[stem] = list(synth_rel)

    return {"version": 5, "sampleRate": 44100, "keys": out}


@lru_cache(maxsize=1)
def get_kit_manifest_cached() -> dict[str, Any]:
    """Single in-memory snapshot (file → remote URL → disk)."""
    path = _configured_kit_manifest_path()
    if path is not None and path.is_file():
        try:
            return _load_kit_manifest_json(path)
        except (OSError, ValueError, json.JSONDecodeError) as e:
            warnings.warn(
                f"KIT_MANIFEST_PATH {path}: {e!r}; trying remote / disk.",
                stacklevel=2,
            )

    url = _remote_kit_manifest_url()
    if url:
        try:
            return _load_kit_manifest_from_url(url)
        except Exception as e:
            warnings.warn(
                f"KIT_MANIFEST_URL {url!r}: {e!r}; falling back to disk scan.",
                stacklevel=2,
            )

    return build_kit_manifest()
