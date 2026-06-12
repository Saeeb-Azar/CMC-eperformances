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


async def _persist_order_action(
    db: AsyncSession, user: dict, reference_id: str, kind: str, reason: str,
) -> None:
    """OrderState zur Ref finden und persistent abschließen/löschen.
      - kind="complete" → COMPLETED (auch für offene/veraltete Aufträge)
      - kind="delete"   → DELETED (Soft-Delete, jeder Zustand)
    Kein DB-Eintrag (reine Live-Session) → No-Op (nur der Broadcast wirkt)."""
    tenant_id = user.get("tenant_id")
    res = await db.execute(
        select(OrderState).where(
            OrderState.tenant_id == tenant_id,
            OrderState.reference_id == reference_id,
        ).order_by(OrderState.created_at.desc()).limit(1)
    )
    order = res.scalar_one_or_none()
    if order is None:
        return
    uid = user.get("sub") or user.get("email") or "unknown"
    try:
        if kind == "complete":
            await orders_service.manual_complete_order(db, order.id, uid, reason)
        else:
            await orders_service.soft_delete_order(db, order.id, uid, reason)
        await db.commit()
    except InvalidStateTransition as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Auftrag ist bereits {order.state} — Aktion nicht möglich.",
        ) from e
    except OrderNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auftrag nicht gefunden",
        ) from e


@router.post("/{reference_id}/resolve")
async def resolve_package(
    reference_id: str,
    data: ActionRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Auftrag manuell als ERLEDIGT/beendet markieren (→ COMPLETED), auch für
    offene/veraltete Aufträge. Persistiert in der DB + broadcastet RESOLVE."""
    await _persist_order_action(db, user, reference_id, "complete", data.reason)
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
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Auftrag löschen (Soft-Delete → DELETED), jeder Zustand. Persistiert in
    der DB + broadcastet DELETE."""
    await _persist_order_action(db, user, reference_id, "delete", data.reason)
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


@router.get("/{reference_id}/details")
async def package_details(
    reference_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Aggregierte Voll-Detailansicht zu einem Paket — für die „Alle Infos"-
    Vollbildansicht im Dashboard. Bündelt OrderState + DHL-Shipment (inkl.
    Label-Base64 für die Vorschau) + Pulpo (PA-Nr, Verkaufsauftrag, Empfänger,
    Artikel). Read-only, mandantengeschützt."""
    from app.modules.dhl.models import Shipment
    from app.modules.pulpo.models import PulpoPackingOrder, PulpoOrderItem

    tenant_id = user["tenant_id"]

    # ── OrderState ──────────────────────────────────────────────────────
    os_row = (await db.execute(
        select(OrderState).where(
            OrderState.tenant_id == tenant_id,
            OrderState.reference_id == reference_id,
        ).order_by(OrderState.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    barcode = (os_row.barcode if os_row else "") or ""

    order_block = None
    if os_row:
        order_block = {
            "state": os_row.state,
            "barcode": os_row.barcode,
            "machine_db_id": os_row.machine_db_id,
            "dimensions": {
                "length_mm": os_row.length_mm, "width_mm": os_row.width_mm,
                "height_mm": os_row.height_mm,
            },
            "weight_g": os_row.weight_g,
            "rejection_reason": os_row.ejection_reason or os_row.rejection_reason,
            "created_at": os_row.created_at.isoformat() if os_row.created_at else None,
        }

    # ── DHL-Shipment (bevorzugt zum aktuellen Barcode, sonst neuester) ──
    sh = None
    if barcode:
        sh = (await db.execute(
            select(Shipment).where(
                Shipment.tenant_id == tenant_id,
                Shipment.reference_id == reference_id,
                Shipment.barcode == barcode,
            ).order_by(Shipment.created_at.desc()).limit(1)
        )).scalar_one_or_none()
    if sh is None:
        sh = (await db.execute(
            select(Shipment).where(
                Shipment.tenant_id == tenant_id,
                Shipment.reference_id == reference_id,
            ).order_by(Shipment.created_at.desc()).limit(1)
        )).scalar_one_or_none()

    dhl_block = None
    if sh:
        dhl_block = {
            "tracking_number": sh.tracking_number,
            "carrier": sh.carrier,
            "product": sh.product,
            "label_format": sh.label_format,
            "label_b64": sh.label_b64 or "",   # für die Label-Vorschau
            "has_label": bool(sh.label_b64),
            "printed_at": sh.printed_at.isoformat() if sh.printed_at else None,
            "print_error": sh.print_error or "",
            "is_test": sh.is_test,
            "recipient": {
                "name": sh.recipient_name, "zip": sh.recipient_zip,
                "city": sh.recipient_city, "country": sh.recipient_country,
            },
            "weight_g": sh.weight_g,
        }

    # ── Pulpo-Packing-Order (über Barcode: cart_box oder Item-EAN) ──────
    po = None
    if barcode:
        po = (await db.execute(
            select(PulpoPackingOrder).where(
                PulpoPackingOrder.tenant_id == tenant_id,
                PulpoPackingOrder.cart_box_barcode == barcode,
            ).limit(1)
        )).scalar_one_or_none()
        if po is None:
            po = (await db.execute(
                select(PulpoPackingOrder).join(
                    PulpoOrderItem, PulpoOrderItem.order_db_id == PulpoPackingOrder.id,
                ).where(
                    PulpoPackingOrder.tenant_id == tenant_id,
                    PulpoOrderItem.ean == barcode,
                ).limit(1)
            )).scalar_one_or_none()

    pulpo_block = None
    if po and isinstance(po.raw_payload, dict):
        rp = po.raw_payload
        so = rp.get("sales_order") or {}
        ship = so.get("ship_to") or {}
        addr = ship.get("address") or {}
        items = []
        for it in (rp.get("items") or []):
            prod = it.get("product") or {}
            bcs = prod.get("barcodes") or []
            items.append({
                "name": prod.get("name") or "",
                "sku": prod.get("sku") or "",
                "ean": (bcs[0] if bcs else ""),
                "quantity": it.get("requested_quantity") or it.get("quantity") or 1,
                "weclapp_article_id": str((prod.get("attributes") or {}).get("weclapp_article_id") or ""),
            })
        pulpo_block = {
            "packing_order_number": rp.get("sequence_number") or "",  # „PA-…"
            "packing_order_id": rp.get("id"),
            "sales_order_number": str(so.get("order_num") or rp.get("sales_order_ref") or ""),
            "shipment_method": rp.get("shipment_method_name") or so.get("shipment_method_name") or "",
            "state": rp.get("state") or "",
            "recipient": {
                "name": ship.get("name") or "",
                "company": ship.get("company_name") or "",
                "phone": ship.get("phone_number") or "",
                "street": addr.get("street") or "",
                "house_nr": addr.get("house_nr") or "",
                "street2": addr.get("street2") or "",
                "zip": addr.get("zip") or "",
                "city": addr.get("city") or "",
                "country": addr.get("country") or addr.get("country_code") or "",
                "email": addr.get("email") or "",
            },
            "items": items,
        }

    return {
        "reference_id": reference_id,
        "barcode": barcode,
        "order": order_block,
        "dhl": dhl_block,
        "pulpo": pulpo_block,
    }
