import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.logging import logger
from app.gateway.websocket import ws_manager
from app.gateway.connection import connection_manager
from app.gateway.persistence import bootstrap_defaults

# Importing the model modules registers them on Base.metadata so create_all
# below knows about every table when running on SQLite (local dev).
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.tenants import models as _tenant_models  # noqa: F401
from app.modules.machines import models as _machine_models  # noqa: F401
from app.modules.orders import models as _order_models  # noqa: F401
from app.modules.audit import models as _audit_models  # noqa: F401

# Import routers from all modules
from app.modules.auth.router import router as auth_router
from app.modules.tenants.router import router as tenants_router
from app.modules.machines.router import router as machines_router
from app.modules.orders.router import router as orders_router
from app.modules.audit.router import router as audit_router
from app.modules.analytics.router import router as analytics_router
from app.modules.simulator.router import router as simulator_router
from app.modules.cmc_actions.router import router as cmc_actions_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    http_port = os.environ.get("PORT", "not set")
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"PORT env = {http_port}")

    # On SQLite (local dev) auto-create the schema. Postgres/Supabase uses Alembic.
    if settings.database_url.startswith("sqlite"):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("SQLite schema ensured via create_all")
        except Exception as e:
            logger.warning(f"create_all failed: {e} — app still starting")

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
app.include_router(cmc_actions_router, prefix=API_PREFIX)


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
        "pending_connections": connection_manager.pending_connections,
        "machine_modes": connection_manager.machine_modes,
        "cw_lists": connection_manager.cw_lists,
        "pending_ejections": connection_manager.pending_ejections,
    }


@app.post("/api/v1/machines/{machine_id}/mode")
def set_machine_mode(machine_id: str, body: dict):
    """Set or clear a per-machine runtime mode (e.g. multi_only).

    Body: {"mode": "multi_only"}  → enable
          {"mode": null}          → disable / clear

    In-memory only; resets when the gateway restarts. Operator action,
    not a config change — kept off DB so persistence stays optional.
    """
    mode = body.get("mode") if isinstance(body, dict) else None
    if mode not in (None, "multi_only"):
        return {"ok": False, "error": "unknown mode"}
    connection_manager.set_mode(machine_id, mode)
    return {"ok": True, "machine_id": machine_id, "mode": mode}


@app.put("/api/v1/machines/{machine_id}/cw-lists/{name}")
def upsert_cw_list(machine_id: str, name: str, body: dict):
    """Anlegen oder Updaten einer benannten CW-Liste auf einer Maschine.

    Body: { "active": true|false, "barcodes": ["M001", ...] }
    Beide Felder optional — was nicht gesendet wird, bleibt unverändert.
    """
    if not isinstance(body, dict):
        return {"ok": False, "error": "expected JSON object"}
    barcodes = body.get("barcodes")
    if barcodes is not None and not isinstance(barcodes, list):
        return {"ok": False, "error": "barcodes must be a list of strings"}
    active = body.get("active")
    serialized = connection_manager.upsert_cw_list(
        machine_id, name,
        barcodes=[str(b) for b in barcodes] if barcodes is not None else None,
        active=bool(active) if active is not None else None,
    )
    return {"ok": True, "machine_id": machine_id, "list": serialized}


@app.delete("/api/v1/machines/{machine_id}/cw-lists/{name}")
def delete_cw_list(machine_id: str, name: str):
    deleted = connection_manager.delete_cw_list(machine_id, name)
    return {"ok": True, "deleted": deleted}


@app.post("/api/v1/runtime/reset")
def reset_runtime(body: dict | None = None):
    """Laufzeitstatus zurücksetzen — aktiver Paket-Tracker + pending
    Ejections. Aufgerufen vom Dashboard-Leeren-Button; ohne diesen
    Schritt würde ein erneuter Scan desselben Barcodes als Doppel-Scan
    abgewiesen, weil der Tracker noch Einträge aus der gerade gelöschten
    Tabelle hält. Optional pro Maschine: {"machine_id": "0001"}.
    CW-Listen und Modi bleiben unberührt.
    """
    machine_id = (body or {}).get("machine_id") if isinstance(body, dict) else None
    summary = connection_manager.reset_runtime(machine_id)
    return {"ok": True, **summary}


@app.post("/api/v1/machines/{machine_id}/eject/{ref}")
def mark_for_ejection(machine_id: str, ref: str):
    """Markiert eine laufende Bestellung zum mid-flight Eject. Beim
    nächsten ACK / INV / LAB1 / LAB2 / END dieses Refs antworten wir mit
    Reject; die Maschine wirft das Paket am nächsten möglichen Gate aus,
    das Band läuft weiter, andere Pakete bleiben unangetastet.
    """
    connection_manager.mark_for_ejection(machine_id, ref)
    return {"ok": True, "machine_id": machine_id, "ref": ref}


@app.delete("/api/v1/machines/{machine_id}/eject/{ref}")
def unmark_ejection(machine_id: str, ref: str):
    removed = connection_manager.unmark_ejection(machine_id, ref)
    return {"ok": True, "removed": removed}


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
