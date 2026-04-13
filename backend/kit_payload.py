"""
Encode generated kit paths (MP3 bytes from light kit) to the same base64 payload shape as ``POST /generate``.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from .generator import generate_kit_light

# Order returned to the web UI (matches generator / solo flow).
API_SOUND_KEYS: tuple[str, ...] = (
    "snare",
    "clap",
    "hihat",
    "open_hat",
    "808",
    "perc",
    "fx",
    "vox",
    "synth1",
    "synth2",
    "synth3",
    "kick",
)


def encode_paths_to_sounds(paths: dict[str, Path]) -> dict[str, str]:
    sounds: dict[str, str] = {}
    for key in API_SOUND_KEYS:
        path = paths[key]
        raw = path.read_bytes()
        sounds[key] = base64.b64encode(raw).decode("ascii")
    return sounds


def kit_to_base64_payload(seed: int, spice: float, output_dir: Path) -> dict[str, Any]:
    """Generate under ``output_dir`` and return ``{seed, sounds}`` (light: random samples, no DSP)."""
    paths = generate_kit_light(seed=seed, spice=spice, output_dir=output_dir)
    sounds = encode_paths_to_sounds(paths)
    return {"seed": seed, "sounds": sounds}
