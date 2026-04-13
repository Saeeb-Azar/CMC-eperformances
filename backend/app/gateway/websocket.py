"""
Event broadcast manager — supports WebSocket, SSE, and HTTP polling.

Railway's proxy can be unreliable for long-lived connections (WebSocket/SSE),
so we also keep a ring buffer of recent events. The frontend can poll
/api/v1/events/recent?since=<id> to fetch new events via plain HTTP GET,
which is guaranteed to work through any proxy.
"""

import asyncio
import json
from collections import deque
from datetime import datetime, timezone

from fastapi import WebSocket

from app.core.logging import logger


# Max events kept in the ring buffer for HTTP polling clients
RING_BUFFER_SIZE = 500


class WebSocketManager:
    """Manages event streaming to browser clients via WebSocket, SSE, and HTTP polling."""

    def __init__(self):
        self._ws_clients: list[WebSocket] = []
        self._sse_queues: list[asyncio.Queue] = []
        # Ring buffer: each entry is {"id": int, ...event fields}
        self._ring: deque[dict] = deque(maxlen=RING_BUFFER_SIZE)
        self._next_id: int = 1

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

    # ── HTTP polling ──────────────────────────────────────────────────────

    def get_events_since(self, since_id: int, limit: int = 200) -> tuple[list[dict], int]:
        """Return events with id > since_id, plus the latest id (for next poll).

        If since_id is 0 or behind the buffer, returns up to `limit` newest events.
        """
        latest_id = self._next_id - 1
        if not self._ring:
            return [], latest_id

        # Events newer than since_id
        result = [e for e in self._ring if e["id"] > since_id]
        if len(result) > limit:
            result = result[-limit:]
        return result, latest_id

    # ── Broadcast ─────────────────────────────────────────────────────────

    async def broadcast(self, event: dict) -> None:
        """Send an event to all connected clients (WS + SSE) and store in ring buffer."""
        event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())

        # Assign an ID and store in ring buffer (for polling clients)
        stored = {**event, "id": self._next_id}
        self._next_id += 1
        self._ring.append(stored)

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
