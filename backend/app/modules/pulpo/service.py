"""Mapping zwischen Pulpo-Webhook-Payloads und unserer DB.

Wir kennen die exakte Pulpo-Payload-Form noch nicht — diese Mapper sind
defensiv: sie versuchen mehrere mögliche Feldnamen (`order_id` /
`packing_order_id` / `id`, …) und stürzen nicht ab wenn was fehlt.
Sobald wir die echte Form gesehen haben (kommt im Log beim ersten Push),
verfeinern wir hier.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger

from .models import PulpoOrderItem, PulpoPackingOrder


def _first(payload: dict, *keys: str, default: Any = None) -> Any:
    """Returns the first present non-empty value among the given keys.
    Praktisch wenn Pulpo Snake-Case oder Camel-Case oder gar `id` statt
    `order_id` schickt — wir probieren alles durch.
    """
    for k in keys:
        v = payload.get(k)
        if v not in (None, ""):
            return v
    return default


def _extract_order_payload(raw: dict) -> dict:
    """Pulpo schickt vermutlich {"event": "...", "data": {...}}. Wenn
    nicht, ist `raw` direkt der Order-Body. Wir versuchen beides.
    """
    if isinstance(raw.get("data"), dict):
        return raw["data"]
    if isinstance(raw.get("packing_order"), dict):
        return raw["packing_order"]
    if isinstance(raw.get("order"), dict):
        return raw["order"]
    return raw


def _extract_items(order: dict) -> list[dict]:
    for key in ("items", "products", "lines", "line_items"):
        v = order.get(key)
        if isinstance(v, list):
            return v
    return []


def _tenant_id_from(payload: dict) -> str | None:
    """Pulpo könnte den Mandanten als `tenant`, `tenant_id`, `client_id`
    oder gar nicht mitschicken. Wir extrahieren wenn möglich; sonst
    verwendet der Caller den Default-Tenant.
    """
    return _first(payload, "tenant_id", "tenant", "client_id", "account_id")


async def _get_default_tenant_id(db: AsyncSession) -> str:
    # Single-Tenant-Setup wie aktuell: nimm den ersten Tenant.
    from app.modules.tenants.models import Tenant
    res = await db.execute(select(Tenant).limit(1))
    tenant = res.scalar_one_or_none()
    if not tenant:
        raise RuntimeError("No tenant in DB — bootstrap should have created one")
    return tenant.id


async def handle_packing_order_created(db: AsyncSession, raw_payload: dict) -> dict:
    """Persistiert eine neue Packing-Order. Idempotent: wenn dieselbe
    Pulpo-Order-ID schon existiert, aktualisieren wir sie (statt zu
    duplizieren) — wichtig wenn Pulpo den Webhook nochmal sendet.
    """
    order_payload = _extract_order_payload(raw_payload)
    pulpo_order_id = _first(order_payload, "id", "order_id", "packing_order_id")
    if not pulpo_order_id:
        logger.warning(f"Pulpo packing_order_created without identifiable order id: {raw_payload!r}")
        return {"ok": False, "reason": "missing order id", "stored": False}

    tenant_id = _tenant_id_from(raw_payload) or await _get_default_tenant_id(db)

    # Upsert-Check
    res = await db.execute(
        select(PulpoPackingOrder).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id == str(pulpo_order_id),
        )
    )
    order = res.scalar_one_or_none()
    is_new = order is None

    if order is None:
        order = PulpoPackingOrder(
            tenant_id=tenant_id,
            pulpo_order_id=str(pulpo_order_id),
        )
        db.add(order)

    # Kommissionier-box (M-Nummer) robust ziehen — auch aus items[].batches
    # (Multi-Order). Sonst landet sie nicht in der CW-Liste.
    from .cw_sync import _extract_cartbox as _xcart
    order.cart_box_barcode = _xcart(order_payload)
    order.state = str(_first(order_payload, "state", "status", default="queue"))
    order.pick_location = str(_first(order_payload, "pick_location", "location", "location_id", default="") or "")
    order.shipping_method = str(_first(order_payload, "shipping_method", "shipment_method", default="") or "")
    order.carrier = str(_first(order_payload, "carrier", default="") or "")
    order.expected_weight_g = _safe_int(_first(order_payload, "expected_weight_g", "weight_g", "weight"))
    order.expected_length_mm = _safe_int(_first(order_payload, "expected_length_mm", "length_mm", "length"))
    order.expected_width_mm = _safe_int(_first(order_payload, "expected_width_mm", "width_mm", "width"))
    order.expected_height_mm = _safe_int(_first(order_payload, "expected_height_mm", "height_mm", "height"))
    order.raw_payload = raw_payload
    order.updated_at = datetime.now(timezone.utc)

    # Items neu setzen (nur bei Create — bei Update bleibts wie es war,
    # falls Pulpo Items getrennt updatet werden wir das später handhaben)
    if is_new:
        for item in _extract_items(order_payload):
            prod = item.get("product") if isinstance(item, dict) else None
            prod = prod if isinstance(prod, dict) else {}
            # Webhook payloads embed the product: item.product.barcodes = ['4005…'].
            barcodes = prod.get("barcodes") if isinstance(prod.get("barcodes"), list) else []
            ean = str(_first(item, "ean", "gtin", "barcode", default="") or "")
            if not ean and barcodes:
                first = barcodes[0]
                ean = str(first.get("barcode") if isinstance(first, dict) else first)
            db.add(PulpoOrderItem(
                order=order,
                ean=ean,
                product_id=str(_first(item, "product_id", default="") or prod.get("id") or prod.get("sku") or ""),
                product_name=str(_first(item, "name", "product_name", default="") or prod.get("name") or ""),
                quantity=_safe_int(_first(item, "requested_quantity", "quantity", "qty", default=1)) or 1,
                raw_payload=item if isinstance(item, dict) else {},
            ))

    await db.flush()
    return {"ok": True, "stored": True, "is_new": is_new, "order_id": order.id}


async def handle_box_closed(db: AsyncSession, raw_payload: dict) -> dict:
    """„Manual Pack Race"-Schutz (cmc-process-doc §5 / Brief Schritt 7).

    Pulpo meldet, dass eine Box geschlossen wurde (z.B. manueller Packplatz).
    Läuft dieselbe Order GERADE auf der Maschine (aktiver OrderState in
    ASSIGNED/INDUCTED/SCANNED/LABELED), darf NICHT zusätzlich ein Label erzeugt
    werden — die Maschine macht das. Sonst (kein aktiver Maschinen-State) wäre
    es ein reiner Manuell-Pack; dort würde ein Label erzeugt.

    Aktuell: SKIP-Erkennung + klares Logging/Ergebnis. Die Label-Erzeugung für
    reine Manuell-Packs ist ein eigener Pfad (TODO) — sie erfordert die volle
    Nicht-Maschinen-Label-Pipeline und ist hier bewusst noch nicht verdrahtet.
    """
    from app.modules.orders.models import OrderState

    order_payload = _extract_order_payload(raw_payload)
    pulpo_order_id = _first(
        order_payload, "packing_order_id", "id", "order_id",
    ) or _first(raw_payload, "packing_order_id")
    tenant_id = _tenant_id_from(raw_payload) or await _get_default_tenant_id(db)
    if not pulpo_order_id:
        return {"ok": True, "skip_label": False, "reason": "missing packing_order_id"}

    active = (await db.execute(
        select(OrderState.id).where(
            OrderState.tenant_id == tenant_id,
            OrderState.pulpo_order_id == str(pulpo_order_id),
            OrderState.state.in_(("ASSIGNED", "INDUCTED", "SCANNED", "LABELED")),
        ).limit(1)
    )).first()

    if active:
        logger.info(
            f"box_closed: Order {pulpo_order_id} läuft auf der Maschine — "
            f"Label-Erzeugung übersprungen (Race-Schutz)"
        )
        return {"ok": True, "skip_label": True, "reason": "active machine state"}

    logger.info(
        f"box_closed: Order {pulpo_order_id} ohne aktiven Maschinen-State — "
        f"reiner Manuell-Pack (Label-Erzeugung: TODO)"
    )
    return {"ok": True, "skip_label": False, "reason": "manual pack (no active machine state)"}


async def handle_packing_order_finished(db: AsyncSession, raw_payload: dict) -> dict:
    """Markiert eine Packing-Order als „closed" (= nicht mehr im Cache
    matchbar). Pulpo schickt das wenn die Order anderswo erledigt wurde
    (z.B. manueller Packplatz, Storno).
    """
    order_payload = _extract_order_payload(raw_payload)
    pulpo_order_id = _first(order_payload, "id", "order_id", "packing_order_id")
    if not pulpo_order_id:
        logger.warning(f"Pulpo packing_order_finished without identifiable order id: {raw_payload!r}")
        return {"ok": False, "reason": "missing order id"}

    tenant_id = _tenant_id_from(raw_payload) or await _get_default_tenant_id(db)
    res = await db.execute(
        select(PulpoPackingOrder).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id == str(pulpo_order_id),
        )
    )
    order = res.scalar_one_or_none()
    if order is None:
        # Pulpo schickt finished für eine Order die wir nie erstellt
        # bekommen haben — kein Drama, einfach loggen.
        logger.info(f"Pulpo packing_order_finished for unknown order {pulpo_order_id}")
        return {"ok": True, "stored": False, "reason": "unknown order"}

    order.state = "closed"
    order.finished_at = datetime.now(timezone.utc)
    order.updated_at = order.finished_at
    await db.flush()
    return {"ok": True, "closed": True, "order_id": order.id}


def _safe_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None
