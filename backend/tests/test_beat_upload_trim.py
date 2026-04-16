"""Beat uploads are transcoded to trimmed OGG (Vorbis) via ffmpeg."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from backend.beat_upload_trim import trim_beat_upload_to_ogg


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not on PATH")
def test_trim_wav_to_ogg() -> None:
    sr = 44100
    n = int(60 * sr)
    mono = np.zeros(n, dtype=np.float32)
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "in.wav"
        sf.write(str(wav), mono, sr, subtype="PCM_16")
        dst = Path(td) / "out.ogg"
        trim_beat_upload_to_ogg(wav, dst, source_suffix=".wav", max_sec=45.0)
        assert dst.is_file() and dst.stat().st_size > 0
        assert not wav.exists()


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not on PATH")
def test_trim_mp3_to_ogg() -> None:
    sr = 44100
    n = int(50 * sr)
    mono = (np.random.default_rng(0).random(n).astype(np.float32) * 0.01) - 0.005
    with tempfile.TemporaryDirectory() as td:
        wav = Path(td) / "in.wav"
        sf.write(str(wav), mono, sr, subtype="PCM_16")
        mp3 = Path(td) / "in.mp3"
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(wav),
                "-c:a",
                "libmp3lame",
                "-b:a",
                "192k",
                str(mp3),
            ],
            check=True,
            capture_output=True,
            timeout=60,
        )
        dst = Path(td) / "out.ogg"
        trim_beat_upload_to_ogg(mp3, dst, source_suffix=".mp3", max_sec=45.0)
        assert dst.is_file() and dst.stat().st_size > 0
        assert not mp3.exists()
