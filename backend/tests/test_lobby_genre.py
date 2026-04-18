"""Multiplayer lobby kit genre (trap / EDM)."""

from __future__ import annotations

import asyncio

from backend.multiplayer.lobby import Lobby, LobbyState, Player
from backend.multiplayer.manager import LobbyManager


def test_create_lobby_accepts_genre_edm(tmp_path) -> None:
    async def run() -> None:
        mgr = LobbyManager(tmp_path)
        p1 = "hostPlayerId"
        mgr.register_auth_session(p1, 1, "Host")
        await mgr.create_lobby(p1, "Host", [0.25, 0.5, 0.85], True, "edm")
        lid = mgr.player_lobby[p1]
        assert mgr.lobbies[lid].genre == "edm"

    asyncio.run(run())


def test_create_lobby_invalid_genre_defaults_trap(tmp_path) -> None:
    async def run() -> None:
        mgr = LobbyManager(tmp_path)
        p1 = "hostPid2"
        mgr.register_auth_session(p1, 2, "Host")
        await mgr.create_lobby(p1, "Host", [0.25], True, "dubstep")
        lid = mgr.player_lobby[p1]
        assert mgr.lobbies[lid].genre == "trap"

    asyncio.run(run())


def test_lobby_snapshot_includes_genre(tmp_path) -> None:
    mgr = LobbyManager(tmp_path)
    lobby = Lobby(id="X1", spice=0.5, genre="edm", is_public=True)
    lobby.players["a"] = Player(id="a", name="A", user_id=1, wins=0)
    snap = lobby.lobby_snapshot()
    assert snap["genre"] == "edm"


def test_kit_meta_includes_genre_for_cooking_player(tmp_path) -> None:
    mgr = LobbyManager(tmp_path)
    lid = "LOBBY1"
    p1 = "p1"
    lobby = Lobby(id=lid, spice=0.5, genre="edm", is_public=True)
    lobby.state = LobbyState.COOKING
    lobby.seed = 12345
    lobby.cook_deadline_ts = 1e12
    lobby.players[p1] = Player(id=p1, name="A", user_id=10, wins=0)
    mgr.lobbies[lid] = lobby
    mgr.player_lobby[p1] = lid
    meta = mgr.get_lobby_kit_meta_for_user(lid, 10)
    assert meta is not None
    assert meta["genre"] == "edm"
