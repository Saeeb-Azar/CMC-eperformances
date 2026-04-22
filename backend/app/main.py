import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.core.logging import logger
from app.gateway.websocket import ws_manager
from app.gateway.connection import connection_manager
from app.gateway.persistence import bootstrap_defaults

# Import routers from all modules
from app.modules.auth.router import router as auth_router
from app.modules.tenants.router import router as tenants_router
from app.modules.machines.router import router as machines_router
from app.modules.orders.router import router as orders_router
from app.modules.audit.router import router as audit_router
from app.modules.analytics.router import router as analytics_router
from app.modules.simulator.router import router as simulator_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    http_port = os.environ.get("PORT", "not set")
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"PORT env = {http_port}")

    # Seed default tenant + admin user so the UI is usable immediately.
    try:
        await bootstrap_defaults()
    except Exception as e:
        logger.warning(f"bootstrap_defaults failed: {e} — app still starting")

    # TCP gateway — try to start, but never crash the app
    tcp_port = settings.cmc_tcp_port
    try:
        # Avoid conflict with the HTTP port
        if http_port.isdigit() and int(http_port) == tcp_port:
            tcp_port = int(http_port) + 1
        await connection_manager.start_server(settings.cmc_tcp_host, tcp_port)
        logger.info(f"TCP Gateway listening on port {tcp_port}")
    except Exception as e:
        logger.warning(f"TCP Gateway failed to start: {e} — HTTP/WS still available")

    yield

    logger.info("Shutting down")
    try:
        await connection_manager.shutdown()
    except Exception:
        pass


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all module routers under /api/v1
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(tenants_router, prefix=API_PREFIX)
app.include_router(machines_router, prefix=API_PREFIX)
app.include_router(orders_router, prefix=API_PREFIX)
app.include_router(audit_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)
app.include_router(simulator_router, prefix=API_PREFIX)


@app.websocket("/ws/simulator")
async def websocket_simulator(ws: WebSocket):
    """WebSocket endpoint: streams live CMC events from the TCP gateway."""
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


@app.websocket("/ws/ping")
async def websocket_ping(ws: WebSocket):
    """Minimal WebSocket echo endpoint — for verifying WS works through Railway's proxy."""
    await ws.accept()
    await ws.send_text("pong")
    try:
        while True:
            msg = await ws.receive_text()
            await ws.send_text(f"echo: {msg}")
    except WebSocketDisconnect:
        pass


@app.get("/api/v1/events/stream")
async def sse_stream():
    """Server-Sent Events endpoint — same data as /ws/simulator but via HTTP.

    Works through any proxy without WebSocket upgrade support.
    """
    queue = ws_manager.add_sse_client()

    async def event_generator():
        try:
            # Initial connection event
            yield f"data: {{\"type\":\"SYSTEM\",\"severity\":\"success\",\"message\":\"SSE connected\"}}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive comment every 25s to prevent proxy timeouts
                    yield ": keepalive\n\n"
        finally:
            ws_manager.remove_sse_client(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering
            "Connection": "keep-alive",
        },
    )


@app.get("/api/v1/events/recent")
def events_recent(since: int = 0, limit: int = 200):
    """HTTP polling endpoint — returns events newer than `since` (event id).

    This is the reliable fallback for Railway's proxy, which can drop long-lived
    connections (WebSocket / SSE). The frontend polls this every ~1s.
    """
    events, latest_id = ws_manager.get_events_since(since, limit=limit)
    return {
        "latest_id": latest_id,
        "events": events,
        "connected_machines": connection_manager.connected_machines,
    }


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/gateway/status")
def gateway_status():
    """Return TCP gateway info so the frontend knows where simulators should connect."""
    # bound_port is the actual port the server bound to — may differ from
    # settings.cmc_tcp_port if Railway's PORT env var collided with it.
    actual_port = connection_manager.bound_port or settings.cmc_tcp_port
    return {
        "listening": connection_manager._server is not None,
        "port": actual_port,
        "configured_port": settings.cmc_tcp_port,
        "connected_machines": connection_manager.connected_machines,
        "websocket_clients": ws_manager.client_count,
    }
