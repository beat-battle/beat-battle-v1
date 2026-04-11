"""
Beat Battle — Solo ``/generate``, multiplayer WebSocket, beat upload, static frontend.

Run from project root: ``uvicorn backend.main:app --reload --port 8000``
Then open http://127.0.0.1:8000/
"""

from __future__ import annotations

import asyncio
import random
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, ORJSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .auth import get_current_user, login_user, register_user
from .audio_utils import SAMPLE_RATE, encode_audio_base64
from .database import get_db, init_db
from .generator import generate_kit
from .kit_payload import API_SOUND_KEYS
from .models import User
from .multiplayer import LobbyManager
from .multiplayer.lobby import LobbyState
from .multiplayer.ws import router as ws_router
from .schemas import LeaderboardEntry, LoginRequest, MeResponse, RegisterRequest, RegisterResponse, TokenResponse

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
UPLOADS_ROOT = _PROJECT_ROOT / "uploads"
FRONTEND_ROOT = _PROJECT_ROOT / "frontend"

MAX_BEAT_BYTES = 15 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    UPLOADS_ROOT.mkdir(parents=True, exist_ok=True)
    manager = LobbyManager(UPLOADS_ROOT)
    app.state.manager = manager

    async def cleanup_loop() -> None:
        while True:
            await asyncio.sleep(120)
            await manager.cleanup_stale()

    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Beat Battle", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


class GenerateRequest(BaseModel):
    """POST /generate JSON body."""

    spice: float = Field(default=0.3, ge=0.0, le=1.0)
    seed: int | None = None


def _solo_generate_sync(seed: int, spice: float) -> dict[str, Any]:
    """Solo kit generation (CPU-bound; run in a thread pool)."""
    paths = generate_kit(seed=seed, spice=spice)
    sounds: dict[str, str] = {}
    for key in API_SOUND_KEYS:
        path = paths[key]
        data, sr = sf.read(str(path), always_2d=False)
        if int(sr) != int(SAMPLE_RATE):
            raise ValueError(f"Unexpected sample rate {sr} for {key}, expected {SAMPLE_RATE}")
        arr = np.asarray(data, dtype=np.float64)
        sounds[key] = encode_audio_base64(arr, sr=int(sr))
    return {"seed": seed, "sounds": sounds}


@app.post("/generate")
async def post_generate(body: GenerateRequest) -> dict[str, Any]:
    """Solo: synthesize a kit, return base64 WAV (44100 Hz)."""
    seed = body.seed if body.seed is not None else random.randint(0, 2**31 - 1)
    return await asyncio.to_thread(_solo_generate_sync, seed, body.spice)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/register", response_model=RegisterResponse)
def post_register(body: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    return register_user(db, body)


@app.post("/login", response_model=TokenResponse)
def post_login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return login_user(db, body)


@app.get("/me", response_model=MeResponse)
def get_me(user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(username=user.username, wins=user.wins)


@app.get("/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db)) -> list[LeaderboardEntry]:
    rows = (
        db.query(User)
        .order_by(desc(User.wins), User.username)
        .limit(50)
        .all()
    )
    return [LeaderboardEntry(username=r.username, wins=r.wins) for r in rows]


@app.get("/api/lobbies")
async def list_public_lobbies(request: Request) -> list[dict[str, Any]]:
    """Joinable public lobbies (pre-game, not full)."""
    manager: LobbyManager = request.app.state.manager
    return await manager.public_lobby_list()


@app.get(
    "/api/lobby/{lobby_id}/kit",
    response_class=ORJSONResponse,
)
async def get_lobby_kit(
    lobby_id: str,
    request: Request,
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Multiplayer kit bytes (same as server-side generation); Bearer auth; player must be in lobby."""
    manager: LobbyManager = request.app.state.manager
    sounds = manager.get_lobby_kit_for_user(lobby_id, user.id)
    if sounds is None:
        raise HTTPException(status_code=404, detail="Kit not available.")
    return {"sounds": sounds}


def _sniff_audio(buf: bytes) -> str | None:
    if len(buf) >= 12 and buf[:4] == b"RIFF" and buf[8:12] == b"WAVE":
        return ".wav"
    if len(buf) >= 3 and buf[:3] == b"ID3":
        return ".mp3"
    if len(buf) >= 2 and buf[0] == 0xFF and (buf[1] & 0xE0) == 0xE0:
        return ".mp3"
    return None


@app.post("/upload/beat/{lobby_id}")
async def upload_beat(
    lobby_id: str,
    player_id: str = Form(),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    manager: LobbyManager = app.state.manager
    if not manager.verify_player_belongs_to_user(lobby_id, player_id, user.id):
        raise HTTPException(status_code=403, detail="Not in this lobby.")
    lobby = manager.lobbies.get(lobby_id)
    if not lobby or player_id not in lobby.players:
        raise HTTPException(status_code=403, detail="Not in this lobby.")
    if lobby.state != LobbyState.UPLOAD:
        raise HTTPException(status_code=400, detail="Upload phase is not active.")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".mp3", ".wav"):
        raise HTTPException(status_code=400, detail="Only .mp3 or .wav allowed.")

    dest_dir = UPLOADS_ROOT / lobby_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{player_id}{suffix}"

    total = 0
    first_chunk: bytes | None = None
    with dest.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 512)
            if not chunk:
                break
            if first_chunk is None:
                first_chunk = chunk[:64]
            total += len(chunk)
            if total > MAX_BEAT_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="File too large (max 15MB).")
            out.write(chunk)

    if total == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty file.")

    sniffed = _sniff_audio(first_chunk or b"")
    if sniffed and sniffed != suffix:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="File content does not match extension.")

    await manager.record_upload(lobby_id, player_id)
    return {"ok": True}


@app.get("/beats/{lobby_id}/{owner_id}")
async def get_beat(
    lobby_id: str,
    owner_id: str,
    requester: str = Query(..., description="Connecting player's id"),
    user: User = Depends(get_current_user),
) -> FileResponse:
    manager: LobbyManager = app.state.manager
    expected = manager.player_id_for_user_in_lobby(lobby_id, user.id)
    if expected is None or expected != requester:
        raise HTTPException(status_code=403, detail="Not allowed.")
    if not manager.can_access_beat(lobby_id, requester):
        raise HTTPException(status_code=403, detail="Not allowed.")
    path = manager.beat_file_path(lobby_id, owner_id)
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="Beat not found.")
    mt = "audio/mpeg" if path.suffix.lower() == ".mp3" else "audio/wav"
    return FileResponse(path, media_type=mt, filename=path.name)


if FRONTEND_ROOT.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_ROOT), html=True), name="site")
