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
    """Zustandskarte für die Einstellungen-Seite."""
    total = (await db.execute(select(func.count()).select_from(Shipment))).scalar() or 0
    live = (await db.execute(
        select(func.count()).select_from(Shipment).where(Shipment.is_test.is_(False))
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
