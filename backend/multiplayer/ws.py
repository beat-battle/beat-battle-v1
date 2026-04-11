"""
WebSocket /ws — JSON messages routed through LobbyManager.
Requires ?token=<JWT> (browser WebSockets cannot send Authorization headers).
"""

from __future__ import annotations

import asyncio
import json
import secrets

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import validate_ws_token

router = APIRouter()


def get_manager(ws: WebSocket):
    return ws.app.state.manager


@router.websocket("/ws")
async def multiplayer_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    token = websocket.query_params.get("token")
    auth = await asyncio.to_thread(validate_ws_token, token)
    if auth is None:
        await websocket.close(code=4401)
        return

    user_id, username = auth
    manager = get_manager(websocket)
    player_id = secrets.token_urlsafe(12)
    manager.register_auth_session(player_id, user_id, username)
    manager.attach_ws(player_id, websocket)
    await websocket.send_json({"type": "connected", "player_id": player_id})
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_to(
                    player_id,
                    {"type": "error", "message": "Invalid JSON."},
                )
                continue
            if not isinstance(data, dict):
                continue
            await manager.handle_message(player_id, data)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(player_id)
