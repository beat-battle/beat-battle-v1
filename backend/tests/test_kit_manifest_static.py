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
    km.get_kit_manifest_edm_cached.cache_clear()
    yield
    km.get_kit_manifest_cached.cache_clear()
    km.get_kit_manifest_edm_cached.cache_clear()


def test_kit_manifest_path_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "kit-manifest.json"
    path.write_text(
        json.dumps(
            _minimal_manifest(
                {
                    "snares": ["trap/snares/x.ogg"],
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
    assert data["keys"]["snares"] == ["trap/snares/x.ogg"]
    syn = ["TrapRefined/synths/a.ogg"]
    assert data["keys"]["synth1"] == syn
    assert data["keys"]["synth2"] == syn
    assert data["keys"]["synth3"] == syn


def test_kit_manifest_invalid_json_falls_back(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = tmp_path / "bad.json"
    path.write_text("{not json", encoding="utf-8")
    monkeypatch.setenv("KIT_MANIFEST_PATH", str(path))
    km.get_kit_manifest_cached.cache_clear()
    # Should not raise; falls back to disk scan
    data = km.get_kit_manifest_cached()
    assert "keys" in data
    assert isinstance(data["keys"], dict)


def test_kit_manifest_edm_path_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "kit-manifest-edm.json"
    path.write_text(
        json.dumps(
            _minimal_manifest(
                {
                    "snares": ["edm/snaresclaps/x.ogg"],
                    "claps": ["edm/snaresclaps/x.ogg"],
                    "hihats": ["edm/hihats/y.ogg"],
                    "openhats": ["edm/crashes/z.ogg"],
                    "808s": ["edm/808s/sub.ogg"],
                    "percs": ["edm/percs/p.ogg"],
                    "fx": ["edm/fx/f.ogg"],
                    "Vox": ["edm/shakersriders/v.ogg"],
                    "kicks": ["edm/kicks/k2.ogg"],
                    "synth1": ["edm/synths/s.ogg"],
                    "synth2": ["edm/synths/s.ogg"],
                    "synth3": ["edm/synths/s.ogg"],
                },
            ),
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("KIT_MANIFEST_EDM_PATH", str(path))
    km.get_kit_manifest_edm_cached.cache_clear()
    data = km.get_kit_manifest_for_genre("edm")
    assert data["keys"]["snares"] == ["edm/snaresclaps/x.ogg"]
    assert data["keys"]["openhats"] == ["edm/crashes/z.ogg"]


def test_edm_resolves_impactsrisers_and_shakersrides(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Packs may use ``impactsrisers`` / ``shakersrides`` instead of ``fx`` / ``shakersriders``."""
    edm_root = tmp_path / "EDM"
    for sub, name in (
        ("kicks", "k.ogg"),
        ("snaresclaps", "s.ogg"),
        ("hihats", "h.ogg"),
        ("crashes", "c.ogg"),
        ("percs", "p.ogg"),
        ("impactsrisers", "f.ogg"),
        ("shakersrides", "v.ogg"),
        ("synths", "sy.ogg"),
    ):
        (edm_root / sub).mkdir(parents=True)
        (edm_root / sub / name).write_bytes(b"\x00")
    monkeypatch.setattr(km, "_EDM_DATASET_ROOT", edm_root)
    monkeypatch.setenv("KIT_MANIFEST_EDM_URL", "")
    km.get_kit_manifest_edm_cached.cache_clear()
    data = km.build_kit_manifest_edm()
    assert data["keys"]["fx"] == ["edm/impactsrisers/f.ogg"]
    assert data["keys"]["Vox"] == ["edm/shakersrides/v.ogg"]


def test_edm_resolves_snares_folder_when_snaresclaps_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Some EDM packs use ``snares/`` on R2 instead of ``snaresclaps/``."""
    edm_root = tmp_path / "EDM"
    (edm_root / "snares").mkdir(parents=True)
    (edm_root / "snares" / "hit.ogg").write_bytes(b"\x00")
    for sub, name in (
        ("kicks", "k.ogg"),
        ("hihats", "h.ogg"),
        ("crashes", "c.ogg"),
        ("percs", "p.ogg"),
        ("fx", "f.ogg"),
        ("shakersriders", "v.ogg"),
        ("synths", "s.ogg"),
    ):
        (edm_root / sub).mkdir(exist_ok=True)
        (edm_root / sub / name).write_bytes(b"\x00")
    monkeypatch.setattr(km, "_EDM_DATASET_ROOT", edm_root)
    monkeypatch.setenv("KIT_MANIFEST_EDM_URL", "")
    km.get_kit_manifest_edm_cached.cache_clear()
    data = km.build_kit_manifest_edm()
    assert any(p.startswith("edm/snares/") for p in data["keys"]["snares"])
    assert any(p.startswith("edm/snares/") for p in data["keys"]["claps"])
    assert data["keys"]["808s"] == []


def test_kit_manifest_legacy_cdn_keys_normalized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Production CDN uses ``snare`` / ``kick`` / …; normalize to slot names."""
    legacy = {
        "version": 6,
        "sampleRate": 44100,
        "keys": {
            "snare": ["beat-battle-assets/TrapRefined/snares/a.ogg"],
            "clap": ["trap/claps/b.ogg"],
            "hihat": ["trap/hihats/c.ogg"],
            "open_hat": ["trap/openhats/d.ogg"],
            "808": ["trap/808s/e.ogg"],
            "perc": ["trap/percs/f.ogg"],
            "fx": ["trap/fx/g.ogg"],
            "vox": ["trap/Vox/h.ogg"],
            "synth1": ["trap/synths/s.ogg"],
            "synth2": ["trap/synths/s.ogg"],
            "synth3": ["trap/synths/s.ogg"],
            "kick": ["trap/kicks/k.ogg"],
        },
    }
    path = tmp_path / "legacy.json"
    path.write_text(json.dumps(legacy), encoding="utf-8")
    monkeypatch.setenv("KIT_MANIFEST_PATH", str(path))
    monkeypatch.setenv("KIT_MANIFEST_URL", "")
    km.get_kit_manifest_cached.cache_clear()
    data = km.get_kit_manifest_cached()
    assert data["keys"]["snares"] == ["TrapRefined/snares/a.ogg"]
    assert data["keys"]["kicks"] == legacy["keys"]["kick"]
    assert data["keys"]["Vox"] == legacy["keys"]["vox"]


def test_get_kit_manifest_for_genre_defaults_trap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "trap-only.json"
    path.write_text(
        json.dumps(
            _minimal_manifest({"kicks": ["trap/kicks/a.ogg"]}),
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("KIT_MANIFEST_PATH", str(path))
    km.get_kit_manifest_cached.cache_clear()
    data = km.get_kit_manifest_for_genre(None)
    assert data["keys"]["kicks"] == ["trap/kicks/a.ogg"]
