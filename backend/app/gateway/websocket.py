"""
WebSocket broadcast manager.

Streams live CMC events from the TCP gateway to all connected frontend clients.
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import WebSocket

from app.core.logging import logger


class WebSocketManager:
    """Manages WebSocket connections and broadcasts events to all clients."""

    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.append(ws)
        logger.info(f"WebSocket client connected ({len(self._clients)} total)")

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._clients:
            self._clients.remove(ws)
        logger.info(f"WebSocket client disconnected ({len(self._clients)} total)")

    async def broadcast(self, event: dict) -> None:
        """Send an event to all connected WebSocket clients."""
        if not self._clients:
            return

        event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        data = json.dumps(event)

        disconnected = []
        for ws in self._clients:
            try:
                await ws.send_text(data)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    @property
    def client_count(self) -> int:
        return len(self._clients)


# Singleton
ws_manager = WebSocketManager()
