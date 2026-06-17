"""Deferred-Write-Replay nach Pulpo (cmc-process-doc §5).

Leitprinzip: Während ein Paket durch die Maschine läuft, wird in Pulpo NUR
GELESEN. Alle Schreibvorgänge werden auf dem ``OrderState`` gesammelt (deferred)
und genau EINMAL bei ``END status=1`` abgespielt — atomar (per-Order-Lock),
idempotent (vorhandenes Tracking → Label-Schritt überspringen). Bei Eject/
Reject/REM passiert in Pulpo NICHTS.

Sequenz (EINZELNE REST-Calls, kein kombinierter Endpunkt):
  1) accept  POST /packing/orders/{id}/accept
  2) box     POST /packing/orders/{id}/box            (+ PUT …/boxes/{box_id}: Maße/Gewicht)
  3) label   POST …/boxes/{box_id}/shipment_tracking  (+ …/attach: Label-PDF)
  4) finish  POST /packing/orders/{id}/finish
  5) close   POST /packing/orders/{id}/close?shipping_location_id=…

⚠️ Die literalen Pflicht-Bodies pro Schritt sind NICHT live verifiziert (422-
Fallen, z.B. ob accept owner_id braucht, was close außer shipping_location_id
will). Der Client kodiert eine Best-Guess-Form — vor dem Scharfschalten gegen die
echte Pulpo-Instanz bestätigen (siehe TODO-Marker / Probe-Tool).

Hinter dem Write-Guard: solange ``pulpo_runtime.write_enabled = False``
(Test-Modus) wird der Replay nur SIMULIERT (geloggt, State→DONE), es geht KEIN
Write an Pulpo.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger

from .client import PulpoError, pulpo
from .models import PulpoOrderItem, PulpoPackingOrder
from .runtime import pulpo_runtime

# Ein Lock PRO Pulpo-Auftrag — verhindert Doppel-Replay (END + Retry parallel).
_locks: dict[str, asyncio.Lock] = {}


def _lock_for(key: str) -> asyncio.Lock:
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


def _dims_and_weight(order) -> tuple[int | None, int | None, int | None, int | None]:
    length = order.final_length_mm or order.dimension_length_mm
    width = order.final_width_mm or order.dimension_width_mm
    height = order.final_height_mm or order.dimension_height_mm
    weight = order.final_weight_g or order.lab1_weight_scale
    return length, width, height, weight


async def _latest_shipment(db: AsyncSession, tenant_id: str, reference_id: str, barcode: str):
    """Das beim LAB1 erzeugte Shipment (Tracking + Label) für diesen Scan."""
    from app.modules.dhl.models import Shipment
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
    return sh


async def _first_product_id(db: AsyncSession, order) -> str | None:
    """product_id für den box-Schritt — aus dem gebundenen Pulpo-Auftrag."""
    if not order.pulpo_order_id:
        return None
    po = (await db.execute(
        select(PulpoPackingOrder).where(
            PulpoPackingOrder.tenant_id == order.tenant_id,
            PulpoPackingOrder.pulpo_order_id == order.pulpo_order_id,
        ).limit(1)
    )).scalar_one_or_none()
    if po is None:
        return None
    it = (await db.execute(
        select(PulpoOrderItem).where(PulpoOrderItem.order_db_id == po.id).limit(1)
    )).scalar_one_or_none()
    return (it.product_id if it and it.product_id else None)


async def replay_to_pulpo(db: AsyncSession, order, *, is_retry: bool = False) -> dict:
    """Spielt die gesammelten Schreibvorgänge EINMAL nach Pulpo ab.

    Rückgabe: ``{"ok": bool, "state": str, "steps": [...], "error": str|None,
    "simulated": bool}``. Setzt ``order.pulpo_replay_state`` (+ ggf. ``order.state``)
    und committet.
    """
    pulpo_order_id = str(order.pulpo_order_id or "").strip()
    result = {"ok": False, "state": order.pulpo_replay_state, "steps": [], "error": None, "simulated": False}

    if not pulpo_order_id:
        # Kein gebundener Pulpo-Auftrag → nichts zu finalisieren (z.B. Test-Demo).
        logger.info(f"Replay skip: OrderState {order.reference_id} ohne pulpo_order_id")
        result.update(ok=True, state=order.pulpo_replay_state, note="kein pulpo_order_id")
        return result

    async with _lock_for(pulpo_order_id):
        # Idempotenz: schon erfolgreich abgespielt → nichts tun.
        if order.pulpo_replay_state == "DONE":
            result.update(ok=True, state="DONE", note="bereits abgespielt")
            return result

        # Write-Guard: im Test-Modus NUR simulieren, kein echter Write.
        if not pulpo_runtime.write_enabled:
            order.pulpo_replay_state = "DONE"
            order.pulpo_replay_error = None
            await db.commit()
            logger.info(
                f"Replay SIMULIERT (Test-Modus, kein Pulpo-Write): "
                f"pulpo_order={pulpo_order_id} ref={order.reference_id}"
            )
            result.update(ok=True, state="DONE", simulated=True)
            return result

        sh = await _latest_shipment(db, order.tenant_id, order.reference_id, order.barcode or "")
        tracking = (sh.tracking_number if sh else "") or (order.tracking_number or "")
        carrier = (sh.carrier if sh else "") or (order.carrier or "DHL")
        tracking_url = (order.tracking_url or "") or (sh.tracking_url if sh and hasattr(sh, "tracking_url") else "")
        length, width, height, weight = _dims_and_weight(order)

        steps: list[str] = []
        order.pulpo_replay_state = "PENDING"
        await db.commit()
        try:
            # 1) accept
            await pulpo.accept_packing_order(pulpo_order_id)
            steps.append("accept")

            # 2) box (idempotent über pulpo_box_id) + Maße/Gewicht
            box_id = order.pulpo_box_id
            if not box_id:
                product_id = await _first_product_id(db, order)
                box = await pulpo.create_box(
                    pulpo_order_id, product_id=product_id, box_number=1, quantity=1,
                )
                box_id = (box.get("id") if isinstance(box, dict) else None) or ""
                order.pulpo_box_id = str(box_id)
                await db.commit()
                steps.append("box.create")
            await pulpo.update_box(
                pulpo_order_id, box_id,
                length_mm=length, width_mm=width, height_mm=height, weight_g=weight,
            )
            steps.append("box.update")

            # 3) label — idempotent: existiert schon ein tracking_code, überspringen.
            existing = await pulpo.list_box_shipment_trackings(pulpo_order_id, box_id)
            has_tracking = any((t or {}).get("tracking_code") for t in existing)
            if not has_tracking and tracking:
                await pulpo.attach_label(
                    pulpo_order_id, box_id,
                    carrier_code=carrier, tracking_code=tracking,
                    tracking_url=tracking_url or None,
                )
                steps.append("label.attach")
            else:
                steps.append("label.skip" if has_tracking else "label.none")

            # 4) finish
            await pulpo.finish_packing_order(pulpo_order_id)
            steps.append("finish")

            # 5) close (shipping_location_id auflösen)
            loc_id = await _resolve_shipping_location(pulpo_order_id)
            if loc_id is not None:
                await pulpo.close_packing_order(pulpo_order_id, loc_id)
                steps.append("close")
            else:
                steps.append("close.no_location")

            order.pulpo_replay_state = "DONE"
            order.pulpo_replay_error = None
            order.state = "COMPLETED"
            await db.commit()
            logger.info(
                f"Replay OK{' (Retry)' if is_retry else ''}: pulpo_order={pulpo_order_id} "
                f"ref={order.reference_id} steps={steps}"
            )
            result.update(ok=True, state="DONE", steps=steps)
            return result

        except Exception as e:
            # Fehler mittendrin → FAILED, deferred Payload BLEIBT erhalten.
            order.pulpo_replay_state = "FAILED"
            order.pulpo_replay_error = f"nach {steps}: {e!r}"[:500]
            order.state = "FAILED"
            await db.commit()
            payload = getattr(e, "payload", None)
            logger.warning(
                f"Replay FAILED: pulpo_order={pulpo_order_id} ref={order.reference_id} "
                f"steps={steps} err={e!r} body={payload!r}"
            )
            result.update(ok=False, state="FAILED", steps=steps, error=str(e))
            return result


async def _resolve_shipping_location(pulpo_order_id: str):
    """shipping_location_id für den close-Schritt — erste gültige Location."""
    try:
        locs = await pulpo.list_shipping_locations(pulpo_order_id)
    except PulpoError as e:
        logger.warning(f"shipping_locations lookup failed for {pulpo_order_id}: {e!r}")
        return None
    for loc in locs or []:
        lid = (loc or {}).get("id")
        if lid is not None:
            return lid
    return None
