import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.core.config import get_settings
from app.core.database import Base, engine
from app.core.logging import logger, log_ring
from app.core.permissions import get_current_user
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
from app.modules.pulpo import models as _pulpo_models  # noqa: F401
from app.modules.dhl import models as _dhl_models  # noqa: F401

# Import routers from all modules
from app.modules.auth.router import router as auth_router
from app.modules.tenants.router import router as tenants_router
from app.modules.machines.router import router as machines_router
from app.modules.orders.router import router as orders_router
from app.modules.audit.router import router as audit_router
from app.modules.analytics.router import router as analytics_router
from app.modules.simulator.router import router as simulator_router
from app.modules.cmc_actions.router import router as cmc_actions_router
from app.modules.demo.router import router as demo_router
from app.modules.pulpo.router import router as pulpo_router
from app.modules.pulpo.runtime import pulpo_runtime
from app.modules.weclapp.router import router as products_router
from app.modules.dhl.router import router as dhl_router
from app.modules.dhl.router import load_persisted_test_mode as _load_dhl_test_mode

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

    # Load the persisted Pulpo Test-Modus (default = safe / writes blocked).
    await _load_pulpo_test_mode()
    await _load_dhl_test_mode()

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

    # Periodic CW-Liste sync: rebuild every machine's Pulpo CW-Liste from the
    # local cache, and (if Pulpo is configured) pull the live queue first as a
    # self-heal for missed webhooks. Defensive — never crashes the app.
    cw_sync_task = asyncio.create_task(_cw_sync_loop())
    retention_task = asyncio.create_task(_retention_loop())
    online_sweep_task = asyncio.create_task(_online_sweep_loop())

    yield

    logger.info("Shutting down")
    cw_sync_task.cancel()
    retention_task.cancel()
    online_sweep_task.cancel()
    try:
        await connection_manager.shutdown()
    except Exception:
        pass


async def _online_sweep_loop() -> None:
    """Online-Status-Wahrheit: HBT setzt is_online=True, aber nichts setzte es
    je zurück — eine tote Maschine blieb in DB/UI ewig „online". Alle 10s:
      1. DB: Maschinen ohne Heartbeat seit >30s auf offline flippen.
      2. Gateway: lange stumme TCP-Sockets physisch wegräumen (>5 Min idle);
         die Anzeige blendet stumme Verbindungen via is_live schon nach 30s aus.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update
    from app.core.database import async_session
    from app.modules.machines.models import Machine

    while True:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(
                seconds=connection_manager_stale_after()
            )
            async with async_session() as db:
                result = await db.execute(
                    update(Machine)
                    .where(
                        Machine.is_online.is_(True),
                        (Machine.last_heartbeat_at.is_(None)) | (Machine.last_heartbeat_at < cutoff),
                    )
                    .values(is_online=False, status="offline")
                )
                await db.commit()
                if result.rowcount:
                    logger.info(f"Online sweep: {result.rowcount} machine(s) marked offline")
            await connection_manager.reap_stale_connections(max_idle_s=300)
        except asyncio.CancelledError:
            break
        except Exception as e:  # never let the loop die
            logger.warning(f"online sweep iteration failed: {e}")
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            break


def connection_manager_stale_after() -> int:
    """Single source for the staleness threshold (gateway + DB sweep)."""
    from app.gateway.connection import MachineConnection
    return MachineConnection.STALE_AFTER_S


async def _load_pulpo_test_mode() -> None:
    """Load the persisted Test-Modus from the first tenant's settings into the
    runtime flag. Defaults to Test-Modus (safe) if nothing is stored."""
    import json
    from sqlalchemy import select
    from app.core.database import async_session
    from app.modules.tenants.models import Tenant
    try:
        async with async_session() as db:
            tenant = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
            settings_json = json.loads(tenant.settings) if tenant and tenant.settings else {}
        # Absent setting → stay in safe Test-Modus.
        pulpo_runtime.write_enabled = not bool(settings_json.get("pulpo_test_mode", True))
        logger.info(f"Pulpo Test-Modus loaded = {pulpo_runtime.test_mode}")
    except Exception as e:
        pulpo_runtime.write_enabled = False  # safe fallback
        logger.warning(f"Could not load Pulpo Test-Modus ({e}) — defaulting to Test-Modus")


async def _persist_pulpo_test_mode(test_mode: bool) -> None:
    """Persist the Test-Modus choice into the first tenant's settings JSON."""
    import json
    from sqlalchemy import select
    from app.core.database import async_session
    from app.modules.tenants.models import Tenant
    async with async_session() as db:
        tenant = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
        if not tenant:
            return
        data = json.loads(tenant.settings) if tenant.settings else {}
        data["pulpo_test_mode"] = bool(test_mode)
        tenant.settings = json.dumps(data)
        await db.commit()


async def _cw_sync_loop() -> None:
    """Background loop that keeps the Pulpo-derived CW-Listen fresh."""
    from app.core.database import async_session
    from app.modules.pulpo import cw_sync

    while True:
        try:
            # Sync first, then sleep — so a fresh deploy and every cycle reflect
            # Pulpo's queue promptly (stale Lagerplätze drop off within one tick).
            async with async_session() as db:
                await cw_sync.resync_cache_from_pulpo(db)   # no-op if Pulpo unconfigured
                await cw_sync.sync_cw_lists_from_cache(db)
                await db.commit()
        except asyncio.CancelledError:
            break
        except Exception as e:  # never let the loop die
            logger.warning(f"CW-sync loop iteration failed: {e}")
        try:
            await asyncio.sleep(settings.cw_sync_interval_s)
        except asyncio.CancelledError:
            break


async def _retention_loop() -> None:
    """Daily cleanup: delete persisted orders + audit logs older than the
    retention window (warned via the bell beforehand)."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import delete
    from app.core.database import async_session
    from app.modules.orders.models import OrderState
    from app.modules.audit.models import AuditLog

    while True:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=settings.retention_days)
            async with async_session() as db:
                r1 = await db.execute(delete(OrderState).where(OrderState.created_at < cutoff))
                r2 = await db.execute(delete(AuditLog).where(AuditLog.timestamp < cutoff))
                audit_deleted = r2.rowcount or 0
                await db.commit()
                if (r1.rowcount or 0) or audit_deleted:
                    logger.info(f"Retention: deleted {r1.rowcount} orders, {audit_deleted} audit rows older than {settings.retention_days}d")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Retention loop iteration failed: {e}")
        try:
            await asyncio.sleep(6 * 3600)  # alle 6 Stunden prüfen
        except asyncio.CancelledError:
            break


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
app.include_router(demo_router, prefix=API_PREFIX)
# Pulpo Webhook-Empfang — prefix=API_PREFIX nicht nötig, der Router
# bringt seinen vollen Pfad selbst mit.
app.include_router(pulpo_router)
# Produkt-Stammdaten (weclapp + Pulpo-Fallback) — voller Prefix im Router.
app.include_router(products_router)
# DHL Parcel DE — Versandlabel-Anbindung (Test-Modus standardmäßig AN).
app.include_router(dhl_router)


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
        "pulpo_test_mode": pulpo_runtime.test_mode,
    }


@app.get("/api/v1/settings/pulpo")
def get_pulpo_settings():
    """Current Pulpo write-safety mode. test_mode=True → no writes reach Pulpo."""
    return {"test_mode": pulpo_runtime.test_mode, "write_enabled": pulpo_runtime.write_enabled}


@app.get("/api/v1/settings/pulpo/status")
async def get_pulpo_status():
    """Status card data for the settings page: connection mode, last resync,
    and current queue counts from the cache."""
    from sqlalchemy import func, select
    from app.core.database import async_session
    from app.modules.pulpo.client import pulpo
    from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder

    open_orders = 0
    barcodes = 0
    cache_locations: dict[str, int] = {}
    try:
        async with async_session() as db:
            open_orders = (await db.execute(
                select(func.count()).select_from(PulpoPackingOrder)
                .where(PulpoPackingOrder.state == "queue")
            )).scalar() or 0
            barcodes = (await db.execute(
                select(func.count(func.distinct(PulpoOrderItem.ean)))
                .join(PulpoPackingOrder, PulpoOrderItem.order_db_id == PulpoPackingOrder.id)
                .where(PulpoPackingOrder.state == "queue", PulpoOrderItem.ean != "")
            )).scalar() or 0
            # Cache-side Lagerplatz distribution — what the sidebar is built
            # from. If this diverges from `locations` (last live pull), the
            # cache is stale / the resync is not landing.
            rows = (await db.execute(
                select(PulpoPackingOrder.pick_location, func.count())
                .where(PulpoPackingOrder.state.notin_(("ended", "closed", "cancelled")))
                .group_by(PulpoPackingOrder.pick_location)
            )).all()
            cache_locations = {(loc or "?"): int(n) for loc, n in rows}
    except Exception as e:
        logger.warning(f"pulpo status counts failed: {e}")

    return {
        "test_mode": pulpo_runtime.test_mode,
        "configured": pulpo.configured,
        "last_sync_at": pulpo_runtime.last_sync_at.isoformat() if pulpo_runtime.last_sync_at else None,
        "last_sync_error": pulpo_runtime.last_sync_error,
        "last_sync_error_at": (
            pulpo_runtime.last_sync_error_at.isoformat() if pulpo_runtime.last_sync_error_at else None
        ),
        "open_orders": open_orders,
        "barcodes": barcodes,
        # live = letzter erfolgreicher Pulpo-Pull; cache = woraus die Sidebar baut
        "locations": pulpo_runtime.last_locations,
        "cache_locations": cache_locations,
    }


@app.post("/api/v1/settings/pulpo/resync")
async def trigger_pulpo_resync():
    """Manual resync: pull the live Pulpo queue NOW, self-heal the cache and
    rebuild the CW-Listen. Returns the result incl. the live Lagerplatz
    distribution — the one-click answer to \"why does the sidebar show X?\"."""
    from app.core.database import async_session
    from app.modules.pulpo import cw_sync

    async with async_session() as db:
        result = await cw_sync.resync_cache_from_pulpo(db)
        await cw_sync.sync_cw_lists_from_cache(db)
        await db.commit()
    return result


@app.get("/api/v1/notifications")
async def get_notifications():
    """Hinweise für die Glocke. Aktuell: Retention-Countdown — warnt, wenn
    gespeicherte Aufträge bald (≤ 14 Tage) automatisch gelöscht werden, mit
    steigender Dringlichkeit (info → warning → critical)."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func, select
    from app.core.database import async_session
    from app.modules.orders.models import OrderState

    notices: list[dict] = []
    retention = settings.retention_days
    try:
        async with async_session() as db:
            oldest = (await db.execute(select(func.min(OrderState.created_at)))).scalar()
            if oldest is not None:
                if oldest.tzinfo is None:
                    oldest = oldest.replace(tzinfo=timezone.utc)
                age_days = (datetime.now(timezone.utc) - oldest).days
                days_left = max(0, retention - age_days)
                if days_left <= 14:
                    warn_cutoff = datetime.now(timezone.utc) - timedelta(days=retention - 14)
                    affected = (await db.execute(
                        select(func.count()).select_from(OrderState)
                        .where(OrderState.created_at < warn_cutoff)
                    )).scalar() or 0
                    severity = "critical" if days_left <= 1 else "warning" if days_left <= 7 else "info"
                    del_date = (datetime.now(timezone.utc) + timedelta(days=days_left)).strftime("%d.%m.%Y")
                    notices.append({
                        "id": "retention",
                        "severity": severity,
                        "days_left": days_left,
                        "title": "Automatische Datenlöschung",
                        "message": (
                            f"{affected} Auftrags-/Log-Einträge werden in {days_left} "
                            f"Tag{'en' if days_left != 1 else ''} (am {del_date}) gelöscht. "
                            f"Aufbewahrung: {retention} Tage."
                        ),
                    })
    except Exception as e:
        logger.warning(f"notifications failed: {e}")
    return {"count": len(notices), "notifications": notices}


@app.get("/api/v1/settings/pulpo/debug")
async def get_pulpo_debug(limit: int = 80):
    """Inspection snapshot of the Pulpo cache — ALL locations (not just CW),
    incl. recently closed orders, so the fast queue turnover doesn't matter.
    Open in the browser to verify location + barcodes are coming through right."""
    from sqlalchemy import desc, select
    from sqlalchemy.orm import selectinload
    from app.core.database import async_session
    from app.modules.pulpo.models import PulpoPackingOrder

    out = []
    async with async_session() as db:
        rows = (await db.execute(
            select(PulpoPackingOrder)
            .options(selectinload(PulpoPackingOrder.items))
            .order_by(desc(PulpoPackingOrder.updated_at))
            .limit(limit)
        )).scalars().all()
        for r in rows:
            raw = r.raw_payload if isinstance(r.raw_payload, dict) else {}
            out.append({
                "pulpo_order_id": r.pulpo_order_id,
                "sequence_number": raw.get("sequence_number"),
                "state": r.state,
                "location": r.pick_location,
                "cart_box_barcode": r.cart_box_barcode or None,
                "items": [
                    {"ean": it.ean or None, "product_name": it.product_name, "quantity": it.quantity}
                    for it in r.items
                ],
            })
    # Distinct locations seen (quick overview of CW vs SACK vs Pack…).
    locations = sorted({o["location"] for o in out if o["location"]})
    return {"count": len(out), "locations": locations, "orders": out}


@app.put("/api/v1/settings/pulpo")
async def set_pulpo_settings(body: dict):
    """Toggle Test-Modus. Body: {"test_mode": true|false}.

    test_mode=True (default) blocks ALL Pulpo write operations — you can work
    with the (read-only) Pulpo data and process test orders, but nothing is
    accepted/boxed/labeled/finished/closed in Pulpo. Persisted on the tenant
    so the choice survives restarts.
    """
    test_mode = bool(body.get("test_mode", True)) if isinstance(body, dict) else True
    pulpo_runtime.write_enabled = not test_mode
    await _persist_pulpo_test_mode(test_mode)
    logger.warning(
        f"Pulpo Test-Modus = {test_mode} (writes {'BLOCKED' if test_mode else 'ENABLED'})"
    )
    return {"ok": True, "test_mode": pulpo_runtime.test_mode}


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

    Pulpo-gepflegte Listen (source="pulpo") sind read-only: ihre Barcodes
    werden ausschließlich aus der Pulpo-Queue abgeleitet. Ein Barcode-Edit
    wird abgelehnt; nur das Active-Flag darf umgeschaltet werden.
    """
    if not isinstance(body, dict):
        return {"ok": False, "error": "expected JSON object"}
    barcodes = body.get("barcodes")
    if barcodes is not None and not isinstance(barcodes, list):
        return {"ok": False, "error": "barcodes must be a list of strings"}
    if barcodes is not None and connection_manager.is_pulpo_list(machine_id, name):
        return {"ok": False, "error": "CW-Liste wird aus Pulpo gepflegt — Barcodes sind read-only"}
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


@app.get("/api/v1/logs/recent")
def get_recent_logs(
    limit: int = 800,
    level: str | None = None,
    since_id: int = 0,
    q: str | None = None,
    format: str = "json",
    user: dict = Depends(get_current_user),
):
    """ALLE Backend-Logs aus dem In-Memory-Ringpuffer (Pulpo, DHL, Print,
    Gateway, …) — fürs Live-Debugging im Dashboard ohne Server-Shell.

    Params: ``limit`` (max Einträge), ``level`` (ab DEBUG/INFO/WARNING/ERROR),
    ``since_id`` (nur neuere → Polling), ``q`` (Volltext im Message/Logger),
    ``format=text`` für reines copy-paste-Log, sonst JSON.
    """
    entries = log_ring.recent(limit=limit, since_id=since_id, level=level, q=q)
    if format == "text":
        lines = [
            f"{e['timestamp']} [{e['level']}] {e['logger']}: {e['message']}"
            + (f"\n    EXC: {e['exception']}" if e.get("exception") else "")
            for e in entries
        ]
        return PlainTextResponse("\n".join(lines))
    return {"logs": entries, "count": len(entries),
            "last_id": entries[-1]["id"] if entries else since_id}


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
        # TCP-Sockets, die offen sind, aber noch keinen Frame gesendet haben —
        # "etwas verbindet sich, hat sich aber noch nicht zu erkennen gegeben".
        "pending_connections": connection_manager.pending_connections,
        # Öffentliche Adresse, die an der MASCHINE einzutragen ist (Railway-
        # TCP-Proxy, z.B. "xyz.proxy.rlwy.net:43521"). Wird im "Maschine
        # hinzufügen"-Flow als Anleitung angezeigt.
        "public_tcp_address": settings.public_tcp_address,
        "websocket_clients": ws_manager.client_count,
    }
