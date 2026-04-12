import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import logger
from app.gateway.websocket import ws_manager
from app.gateway.connection import connection_manager

# Import routers from all modules
from app.modules.auth.router import router as auth_router
from app.modules.tenants.router import router as tenants_router
from app.modules.machines.router import router as machines_router
from app.modules.orders.router import router as orders_router
from app.modules.audit.router import router as audit_router
from app.modules.analytics.router import router as analytics_router
from app.modules.simulator.router import router as simulator_router

settings = get_settings()

# Resolve TCP gateway port — avoid collision with Uvicorn's HTTP port
_uvicorn_port = int(os.environ.get("PORT", 8000))
_tcp_port = settings.cmc_tcp_port
if _tcp_port == _uvicorn_port:
    _tcp_port = _uvicorn_port + 1
_tcp_active = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tcp_active
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"HTTP port (PORT env): {_uvicorn_port}, TCP gateway target port: {_tcp_port}")

    # Start TCP gateway — non-fatal: if port is busy, HTTP/WS still works
    try:
        await connection_manager.start_server(settings.cmc_tcp_host, _tcp_port)
        _tcp_active = True
        logger.info(f"CMC TCP Gateway listening on port {_tcp_port}")
    except OSError as e:
        logger.warning(f"Could not start TCP gateway on port {_tcp_port}: {e}")
        logger.warning("HTTP and WebSocket will work, but TCP simulator connections are disabled")

    yield

    logger.info("Shutting down")
    await connection_manager.shutdown()


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
    return {
        "listening": _tcp_active,
        "port": _tcp_port,
        "http_port": _uvicorn_port,
        "connected_machines": connection_manager.connected_machines,
        "websocket_clients": ws_manager.client_count,
    }
