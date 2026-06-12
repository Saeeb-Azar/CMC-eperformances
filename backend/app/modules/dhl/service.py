"""DHL-Service — Brücke zwischen der CW1000-LAB1-Anforderung und dem
DHL-Client. Persistiert jede erzeugte (auch Test-)Sendung und fungiert
als idempotenter Wiederholungs-Punkt: existiert für einen Auftrag schon
ein Label, wird das alte zurückgegeben statt ein zweites zu erzeugen.

Aktuell wird der Service NICHT automatisch im LAB1-Handler aufgerufen —
das geschieht in einem späteren Schritt, sobald die echte Maschine die
restlichen Antworten sauber verarbeitet. Bis dahin ist der Service über
``POST /api/v1/shipments/test-label`` manuell testbar.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger

from .client import Address, DhlError, dhl
from .models import Shipment
from .runtime import dhl_runtime


async def create_label_for_order(
    db: AsyncSession,
    *,
    tenant_id: str,
    order_ref: str,
    order_state_id: str | None,
    recipient: Address,
    weight_g: int,
    length_mm: int,
    width_mm: int,
    height_mm: int,
    product: str | None = None,
    barcode: str = "",
) -> Shipment:
    """Label erzeugen + persistieren. Idempotent über ``order_state_id``:
    existiert bereits eine Sendung für diesen OrderState, wird sie
    unverändert zurückgegeben (verhindert Doppel-Sendungen z.B. bei einem
    Retry nach END-Fehler)."""

    if order_state_id:
        existing = (await db.execute(
            select(Shipment)
            .where(Shipment.tenant_id == tenant_id, Shipment.order_state_id == order_state_id)
            .order_by(Shipment.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if existing:
            logger.info(
                f"DHL idempotent hit: order_state={order_state_id} already has "
                f"tracking={existing.tracking_number} — reusing"
            )
            return existing

    result = await dhl.create_shipment(
        recipient=recipient, weight_g=weight_g,
        length_mm=length_mm, width_mm=width_mm, height_mm=height_mm,
        order_ref=order_ref, product=product,
    )

    shipment = Shipment(
        tenant_id=tenant_id,
        order_state_id=order_state_id,
        reference_id=order_ref,  # für die Druck-Queue (QZ-Agent findet darüber)
        barcode=barcode,         # zum (ref, barcode)-Matching in der Detail-/Cache-Logik
        carrier="DHL",
        product=product or "V01PAK",
        tracking_number=result["tracking"],
        recipient_name=recipient.name,
        recipient_zip=recipient.zip_code,
        recipient_city=recipient.city,
        recipient_country=recipient.country,
        weight_g=weight_g,
        length_mm=length_mm,
        width_mm=width_mm,
        height_mm=height_mm,
        label_b64=result["label_b64"],
        label_format=result["label_format"],
        is_test=dhl_runtime.test_mode,
        raw_response=result.get("raw") or {},
    )
    db.add(shipment)
    await db.flush()
    logger.info(
        f"DHL label created: tracking={shipment.tracking_number} test={shipment.is_test}"
    )
    return shipment


# Re-export so callers don't need to import the error twice.
__all__ = ["create_label_for_order", "Address", "DhlError"]
