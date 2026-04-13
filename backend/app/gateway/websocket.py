"""
Event broadcast manager — supports both WebSocket and Server-Sent Events (SSE).

SSE works through any HTTP proxy without special WebSocket upgrade support,
which is important for Railway's proxy. Each browser client gets an asyncio
Queue; events are pushed via broadcast() and consumed by the SSE generator.
"""

import asyncio
import json
from datetime import datetime, timezone

from fastapi import WebSocket

from app.core.logging import logger


class WebSocketManager:
    """Manages event streaming to browser clients via WebSocket and SSE."""

    def __init__(self):
        self._ws_clients: list[WebSocket] = []
        self._sse_queues: list[asyncio.Queue] = []

    # ── WebSocket clients ─────────────────────────────────────────────────

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._ws_clients.append(ws)
        logger.info(f"WebSocket client connected ({len(self._ws_clients)} total)")

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._ws_clients:
            self._ws_clients.remove(ws)
        logger.info(f"WebSocket client disconnected ({len(self._ws_clients)} total)")

    # ── SSE clients ───────────────────────────────────────────────────────

    def add_sse_client(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._sse_queues.append(q)
        logger.info(f"SSE client connected ({len(self._sse_queues)} total)")
        return q

    def remove_sse_client(self, q: asyncio.Queue) -> None:
        if q in self._sse_queues:
            self._sse_queues.remove(q)
        logger.info(f"SSE client disconnected ({len(self._sse_queues)} total)")

    # ── Broadcast ─────────────────────────────────────────────────────────

    async def broadcast(self, event: dict) -> None:
        """Send an event to all connected clients (both WebSocket and SSE)."""
        event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        data = json.dumps(event)

        # WebSocket clients
        disconnected = []
        for ws in self._ws_clients:
            try:
                await ws.send_text(data)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)

        # SSE clients
        for q in list(self._sse_queues):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass  # slow consumer, drop event

    @property
    def client_count(self) -> int:
        return len(self._ws_clients) + len(self._sse_queues)


# Singleton
ws_manager = WebSocketManager()
