"""
Manual resolution actions for CMC packages — Section 9 of the process doc.

Endpoints let an admin/operator mark an EJECTED or FAILED package as
resolved, retry a failed completion, or soft-delete a state. The action is
broadcast as a synthetic event into the live event stream so the dashboard
reflects it immediately, without needing a separate DB read path.
"""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import InvalidStateTransition, OrderNotFound
from app.core.permissions import get_current_user
from app.gateway.websocket import ws_manager
from app.modules.orders import service as orders_service
from app.modules.orders.models import OrderState


router = APIRouter(prefix="/packages", tags=["packages"])


class ActionRequest(BaseModel):
    machine_id: str = Field(..., description="Machine the package was on")
    reason: str = Field(..., min_length=1, max_length=500)
    tracking_code: str | None = None
    tracking_url: str | None = None


async def _broadcast_action(
    action: Literal["RESOLVE", "RETRY", "DELETE"],
    reference_id: str,
    data: ActionRequest,
    user: dict,
) -> dict:
    payload = {
        "reference_id": reference_id,
        "reason": data.reason,
        "resolved_by": user.get("email") or user.get("sub", "unknown"),
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.tracking_code:
        payload["tracking_code"] = data.tracking_code
    if data.tracking_url:
        payload["tracking_url"] = data.tracking_url

    severity_map = {"RESOLVE": "success", "RETRY": "info", "DELETE": "warning"}
    label_map = {"RESOLVE": "gelöst", "RETRY": "Wiederholung gestartet", "DELETE": "gelöscht"}

    await ws_manager.broadcast({
        "type": action,
        "severity": severity_map[action],
        "message": f"Paket {reference_id} {label_map[action]} ({payload['resolved_by']})",
        "machine_id": data.machine_id,
        "data": payload,
    })
    return {"ok": True, "action": action, "reference_id": reference_id}


@router.post("/{reference_id}/resolve")
async def resolve_package(
    reference_id: str,
    data: ActionRequest,
    user: dict = Depends(get_current_user),
):
    return await _broadcast_action("RESOLVE", reference_id, data, user)


@router.post("/{reference_id}/retry")
async def retry_package(
    reference_id: str,
    data: ActionRequest,
    user: dict = Depends(get_current_user),
):
    return await _broadcast_action("RETRY", reference_id, data, user)


@router.post("/{reference_id}/delete")
async def delete_package(
    reference_id: str,
    data: ActionRequest,
    user: dict = Depends(get_current_user),
):
    return await _broadcast_action("DELETE", reference_id, data, user)


@router.post("/{reference_id}/manual-eject")
async def manual_eject_package(
    reference_id: str,
    data: ActionRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """„Notausstieg" für hängende Aufträge: der Operator markiert einen
    Auftrag manuell als EJECTED — typischerweise, wenn die Maschine den
    Auftrag nie zu Ende verarbeitet hat (Crash, Stromausfall, Paket physisch
    entfernt). Updated die DB UND broadcastet ein EJECT-Event, damit die
    Tabelle/Karten sofort umspringen.

    Anders als das mid-flight-Eject auf der Maschine (Connection-Manager
    consume_ejection) braucht das hier KEINE laufende Verbindung — es
    funktioniert auch, wenn die Maschine längst weg ist."""
    # OrderState in der DB finden (für persistenten Statuswechsel).
    # Wir filtern auf reference_id + Tenant; eine identische Ref pro Tenant
    # ist im normalen Betrieb eindeutig (eine aktive Inkarnation).
    tenant_id = user.get("tenant_id")
    res = await db.execute(
        select(OrderState).where(
            OrderState.tenant_id == tenant_id,
            OrderState.reference_id == reference_id,
        ).order_by(OrderState.created_at.desc()).limit(1)
    )
    order = res.scalar_one_or_none()
    if order is not None:
        try:
            await orders_service.manual_eject_order(
                db, order.id,
                user_id=user.get("sub") or user.get("email") or "unknown",
                reason=data.reason,
            )
            await db.commit()
        except InvalidStateTransition as e:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Auftrag ist bereits terminal ({order.state}) — kein manuelles Eject mehr möglich.",
            ) from e
        except OrderNotFound as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Auftrag nicht gefunden",
            ) from e

    # Live-Broadcast — als EJECT-Event, damit die Tabelle (im Speicher) und
    # die Verlauf-Anzeige sofort reagieren, auch wenn der Auftrag nicht in
    # der DB war (z.B. reine Live-Session).
    payload = {
        "reference_id": reference_id,
        "reason": data.reason,
        "resolved_by": user.get("email") or user.get("sub", "unknown"),
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "ejection_reason": f"manual: {data.reason.strip()}",
    }
    await ws_manager.broadcast({
        "type": "EJECT",
        "severity": "warning",
        "message": f"Paket {reference_id} manuell als ausgeworfen markiert ({payload['resolved_by']})",
        "machine_id": data.machine_id,
        "data": payload,
    })
    return {"ok": True, "action": "MANUAL_EJECT", "reference_id": reference_id}
