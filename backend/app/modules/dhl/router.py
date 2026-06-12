"""DHL-HTTP-Endpunkte: Status, Test-Modus-Toggle, Test-Label.

Schreibvorgänge sind durchgehend schreibgeguardet (``dhl_runtime``). Der
Test-Label-Endpunkt funktioniert beidseitig:
  - Test-Modus AN  → liefert Mock-Tracking, kein DHL-Call
  - Test-Modus AUS → ruft die echte DHL-API auf (echtes Label, kostet!)
"""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import logger
from app.core.permissions import get_current_user, require_role, Role

from .client import Address, DhlError, dhl
from .models import Shipment
from .runtime import dhl_runtime
from .service import create_label_for_order

router = APIRouter(prefix="/api/v1", tags=["dhl"])


# ----- Status & Test-Modus -----------------------------------------------

@router.get("/settings/dhl/status")
async def get_dhl_status(db: AsyncSession = Depends(get_db)):
    """Zustandskarte für die Einstellungen-Seite. Liefert genug
    Telemetrie, dass der Operator den ganzen Label-Pfad ohne Log-Wühlen
    diagnostizieren kann (Pre-Creation, Druck-Queue, letzte Fehler)."""
    total = (await db.execute(select(func.count()).select_from(Shipment))).scalar() or 0
    live = (await db.execute(
        select(func.count()).select_from(Shipment).where(Shipment.is_test.is_(False))
    )).scalar() or 0
    queue_open = (await db.execute(
        select(func.count()).select_from(Shipment).where(
            Shipment.printed_at.is_(None), Shipment.label_b64 != "",
        )
    )).scalar() or 0
    print_problems = (await db.execute(
        select(func.count()).select_from(Shipment).where(
            Shipment.printed_at.is_(None), Shipment.print_error != "",
        )
    )).scalar() or 0
    return {
        "test_mode": dhl_runtime.test_mode,
        "configured": dhl.configured,
        "base_url": dhl.base_url,
        "billing_number_set": bool(dhl.billing_number),
        "last_label_at": dhl_runtime.last_label_at.isoformat() if dhl_runtime.last_label_at else None,
        "last_label_tracking": dhl_runtime.last_label_tracking,
        "last_error": dhl_runtime.last_error,
        "last_error_at": dhl_runtime.last_error_at.isoformat() if dhl_runtime.last_error_at else None,
        "shipments_total": int(total),
        "shipments_live": int(live),
        # Pre-Creation-Telemetrie (siehe gateway/connection.py _precreate_label)
        "precreate_total": dhl_runtime.precreate_total,
        "precreate_ok": dhl_runtime.precreate_ok,
        "precreate_last_msg": dhl_runtime.precreate_last_msg,
        "precreate_last_at": (
            dhl_runtime.precreate_last_at.isoformat() if dhl_runtime.precreate_last_at else None
        ),
        # Druckqueue-Telemetrie (Mini-Daemon)
        "print_queue_open": int(queue_open),
        "print_problems": int(print_problems),
    }


class DhlTestModeIn(BaseModel):
    test_mode: bool


@router.put("/settings/dhl")
async def set_dhl_settings(body: DhlTestModeIn, user: dict = Depends(require_role(Role.TENANT_ADMIN))):
    """Test-Modus für DHL umschalten — analog Pulpo. Bei AUS gehen echte
    Sendungen raus, kosten Geld."""
    dhl_runtime.write_enabled = not body.test_mode
    await _persist_dhl_test_mode(body.test_mode)
    logger.info(f"DHL test-mode set to {body.test_mode} (write_enabled={dhl_runtime.write_enabled})")
    return {"ok": True, "test_mode": dhl_runtime.test_mode}


# ----- Test-Label --------------------------------------------------------

class TestLabelIn(BaseModel):
    weight_g: int = Field(gt=0, le=31_500)
    length_mm: int = Field(gt=0, le=1200)
    width_mm: int = Field(gt=0, le=600)
    height_mm: int = Field(gt=0, le=600)
    recipient_name: str = "Max Mustermann"
    recipient_street: str = "Musterstr."
    recipient_street_no: str = "1"
    recipient_zip: str = "53113"
    recipient_city: str = "Bonn"
    recipient_country: str = "DEU"
    order_ref: str = "TEST-ORDER"
    product: str | None = None


# ── Druckwarteschlange — wird vom LAN-Daemon abgepollt ─────────────────

class PrintQueueItem(BaseModel):
    id: str
    reference_id: str
    tracking_number: str
    label_b64: str
    label_format: str  # "PDF" / "ZPL2"
    created_at: datetime


@router.get("/print-queue", response_model=list[PrintQueueItem])
async def get_print_queue(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Offene Druckaufträge des Tenants — vom Mini-Daemon im LAN gepollt.
    Liefert nur Shipments, die noch nicht ``printed_at`` haben und ein
    Label-Base64 enthalten (sonst nichts zu drucken)."""
    res = await db.execute(
        select(Shipment).where(
            Shipment.tenant_id == user["tenant_id"],
            Shipment.printed_at.is_(None),
            Shipment.label_b64 != "",
        ).order_by(Shipment.created_at.asc()).limit(limit)
    )
    return [
        PrintQueueItem(
            id=s.id, reference_id=s.reference_id,
            tracking_number=s.tracking_number,
            label_b64=s.label_b64, label_format=s.label_format,
            created_at=s.created_at,
        )
        for s in res.scalars().all()
    ]


class MarkPrintedRequest(BaseModel):
    error: str | None = None  # leer = erfolgreich; sonst Fehler vom Drucker


class PrintProblemItem(BaseModel):
    id: str
    reference_id: str
    tracking_number: str
    print_error: str
    created_at: datetime


@router.get("/print-queue/problems", response_model=list[PrintProblemItem])
async def get_print_problems(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Sendungen mit aktuellem Druckfehler — für die UI-Übersicht. Wird im
    Sekundentakt vom Frontend gepollt, damit der Operator Druck-Probleme
    sofort sieht."""
    res = await db.execute(
        select(Shipment).where(
            Shipment.tenant_id == user["tenant_id"],
            Shipment.printed_at.is_(None),
            Shipment.print_error != "",
        ).order_by(Shipment.created_at.desc()).limit(limit)
    )
    return [
        PrintProblemItem(
            id=s.id, reference_id=s.reference_id,
            tracking_number=s.tracking_number,
            print_error=s.print_error, created_at=s.created_at,
        )
        for s in res.scalars().all()
    ]


@router.post("/print-queue/{shipment_id}/mark-printed")
async def mark_printed(
    shipment_id: str,
    body: MarkPrintedRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Daemon meldet zurück: erfolgreich gedruckt (``error`` leer) oder
    Druckfehler. Im Fehlerfall bleibt printed_at NULL → der Eintrag landet
    beim nächsten Poll wieder in der Queue.

    Erfolg + Fehler werden zusätzlich:
      • ins App-Log (logger.info / .warning) geschrieben
      • über WebSocket broadcastet (Live-Protokoll → grünes / rotes Event)
      • bei Fehler in dhl_runtime.last_error gespiegelt (DHL-Status-Karte)
    """
    from app.core.logging import logger
    from app.gateway.websocket import ws_manager
    from datetime import datetime as _dt
    from .runtime import dhl_runtime

    sh = (await db.execute(
        select(Shipment).where(
            Shipment.tenant_id == user["tenant_id"],
            Shipment.id == shipment_id,
        )
    )).scalar_one_or_none()
    if not sh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    if body.error:
        sh.print_error = body.error[:1000]
        msg = (
            f"Druckfehler ref={sh.reference_id} tracking={sh.tracking_number}: "
            f"{body.error[:200]}"
        )
        logger.warning(f"PRINT FAILED: {msg}")
        await ws_manager.broadcast({
            "type": "PRINT_FAILED",
            "severity": "error",
            "message": msg,
            "data": {
                "reference_id": sh.reference_id,
                "tracking_number": sh.tracking_number,
                "shipment_id": sh.id,
                "error": body.error[:500],
            },
        })
        # Auch in der DHL-Statuskarte sichtbar machen — Operator sieht's
        # ohne ins Protokoll wechseln zu müssen.
        dhl_runtime.last_error = f"Druck: {body.error[:300]}"
        dhl_runtime.last_error_at = _dt.utcnow()
    else:
        sh.printed_at = _dt.utcnow()
        sh.print_error = ""
        logger.info(
            f"PRINT OK: ref={sh.reference_id} tracking={sh.tracking_number}"
        )
        await ws_manager.broadcast({
            "type": "PRINT_OK",
            "severity": "success",
            "message": f"Label gedruckt: {sh.reference_id} ({sh.tracking_number})",
            "data": {
                "reference_id": sh.reference_id,
                "tracking_number": sh.tracking_number,
                "shipment_id": sh.id,
            },
        })

    await db.commit()
    return {"ok": True, "printed": sh.printed_at is not None}


@router.post("/shipments/test-label")
async def create_test_label(
    body: TestLabelIn,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    """Ein Label gegen DHL anfordern — im Test-Modus Mock, sonst echtes
    Label. Persistiert die Sendung und liefert Tracking + Label-Format."""
    recipient = Address(
        name=body.recipient_name, street=body.recipient_street,
        street_no=body.recipient_street_no, zip_code=body.recipient_zip,
        city=body.recipient_city, country=body.recipient_country,
    )
    try:
        s = await create_label_for_order(
            db, tenant_id=user["tenant_id"], order_ref=body.order_ref,
            order_state_id=None, recipient=recipient,
            weight_g=body.weight_g, length_mm=body.length_mm,
            width_mm=body.width_mm, height_mm=body.height_mm,
            product=body.product,
        )
        await db.commit()
    except DhlError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"DHL error: {e} ({getattr(e, 'payload', None)})",
        ) from e
    return {
        "tracking_number": s.tracking_number,
        "label_format": s.label_format,
        "label_b64_length": len(s.label_b64),
        "is_test": s.is_test,
        "created_at": s.created_at.isoformat(),
    }


# ----- Helpers -----------------------------------------------------------

async def _persist_dhl_test_mode(test_mode: bool) -> None:
    """Test-Modus in den Tenant-Settings ablegen — beim nächsten Start
    wieder laden (siehe main.py)."""
    from app.core.database import async_session
    from app.modules.tenants.models import Tenant

    async with async_session() as db:
        tenant = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
        if not tenant:
            return
        data = json.loads(tenant.settings) if tenant.settings else {}
        data["dhl_test_mode"] = bool(test_mode)
        tenant.settings = json.dumps(data)
        await db.commit()


async def load_persisted_test_mode() -> None:
    """Beim App-Start aufrufen (main.py-Lifespan) — spiegelt den
    persistierten Test-Modus in den Runtime-Schalter."""
    from app.core.database import async_session
    from app.modules.tenants.models import Tenant
    try:
        async with async_session() as db:
            tenant = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
            data = json.loads(tenant.settings) if tenant and tenant.settings else {}
        dhl_runtime.write_enabled = not bool(data.get("dhl_test_mode", True))
        logger.info(f"DHL Test-Modus loaded = {dhl_runtime.test_mode}")
    except Exception as e:
        dhl_runtime.write_enabled = False
        logger.warning(f"Could not load DHL Test-Modus ({e}) — defaulting to Test-Modus")
