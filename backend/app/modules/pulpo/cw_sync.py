"""CW-Liste ↔ Pulpo packing-queue sync.

The CW-Liste of a machine mirrors the Pulpo **packing queue** (menu „Packen" →
„In Warteschlange"). For this tenant the whole queue is CartonWrap work, so by
default we take the ENTIRE packing queue. ``pulpo_pick_location`` on a machine
is an OPTIONAL extra filter (origin_location_code) — leave it empty to get all.

Two mechanisms keep it live:
  1. Webhooks (packing_order_created/finished) update the cache; afterwards we
     rebuild the CW-Listen from the cache.
  2. A periodic resync pulls the live queue from Pulpo into the cache and
     self-heals: orders no longer in Pulpo's queue are closed so they drop off
     the CW-Liste.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import logger
from app.gateway.connection import connection_manager
from app.modules.machines.models import Machine

from .client import PulpoError, pulpo
from .models import PulpoOrderItem, PulpoPackingOrder
from .runtime import pulpo_runtime


async def build_cw_items_for_location(
    db: AsyncSession, tenant_id: str, pick_location: str | None,
) -> dict[str, int]:
    """Aggregate barcode → expected-quantity over the cached queue. With no
    ``pick_location`` it covers the whole packing queue; with one it filters
    by the cached order location."""
    stmt = (
        select(PulpoOrderItem.ean, func.sum(PulpoOrderItem.quantity))
        .join(PulpoPackingOrder, PulpoOrderItem.order_db_id == PulpoPackingOrder.id)
        .where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.state == "queue",
            PulpoOrderItem.ean != "",
        )
        .group_by(PulpoOrderItem.ean)
    )
    if pick_location:
        # Prefix match: a machine configured with "CW" picks up CW1/CW6/CW10/…
        # (CartonWrap locations) and excludes SACK* (manual sack packing).
        stmt = stmt.where(PulpoPackingOrder.pick_location.like(f"{pick_location}%"))
    rows = (await db.execute(stmt)).all()
    return {ean: int(qty or 0) for ean, qty in rows if ean}


async def build_cw_lists_by_location(
    db: AsyncSession, tenant_id: str, prefix: str | None,
) -> dict[str, dict[str, int]]:
    """One CW-Liste per Lagerplatz: {location_code: {barcode: expected_qty}}.

    With ``prefix`` set (e.g. "CW") only locations starting with it are included
    (CW1/CW6/CW10 …, excluding SACK*). Per order the scannable barcode is the
    cart-box barcode if present (multi-order), else the items' EANs. Locations
    with queued orders appear even if no barcode resolved yet (empty list)."""
    stmt = (
        select(PulpoPackingOrder)
        .where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.state.notin_(("ended", "closed", "cancelled")),
        )
        .options(selectinload(PulpoPackingOrder.items))
    )
    if prefix:
        stmt = stmt.where(PulpoPackingOrder.pick_location.like(f"{prefix}%"))
    orders = (await db.execute(stmt)).scalars().all()
    result: dict[str, dict[str, int]] = {}
    for o in orders:
        loc = (o.pick_location or "?").strip() or "?"
        bucket = result.setdefault(loc, {})
        if o.cart_box_barcode:
            bucket[o.cart_box_barcode] = bucket.get(o.cart_box_barcode, 0) + 1
        else:
            for it in o.items:
                if it.ean:
                    bucket[it.ean] = bucket.get(it.ean, 0) + (it.quantity or 1)
    return result


async def sync_cw_lists_from_cache(db: AsyncSession) -> int:
    """Rebuild the Pulpo CW-Listen of every active machine — one list per
    Lagerplatz. ``pulpo_pick_location`` is the location prefix filter (empty =
    all locations)."""
    machines = (
        await db.execute(select(Machine).where(Machine.is_active.is_(True)))
    ).scalars().all()
    for m in machines:
        lists = await build_cw_lists_by_location(db, m.tenant_id, m.pulpo_pick_location or None)
        connection_manager.set_pulpo_cw_lists(m.machine_id, lists)
    return len(machines)


async def resync_cache_from_pulpo(db: AsyncSession) -> dict[str, Any]:
    """Self-heal: pull the live packing queue from Pulpo into the cache, then
    rebuild the CW-Listen. Orders no longer in Pulpo's queue get closed so they
    drop off. Best-effort — a Pulpo failure is logged, not raised."""
    if not pulpo.configured:
        return {"ok": False, "reason": "pulpo not configured"}

    has_machine = (
        await db.execute(select(Machine.id).where(Machine.is_active.is_(True)).limit(1))
    ).first()
    if not has_machine:
        return {"ok": True, "machines": 0}

    from .service import _get_default_tenant_id  # local import avoids a cycle
    tenant_id = await _get_default_tenant_id(db)
    product_cache: dict[str, str] = {}

    # Resolve origin_location_id → Lagerplatz code (e.g. 247 → "CW10").
    loc_map: dict[str, str] = {}
    try:
        for loc in await pulpo.list_packing_locations():
            lid = loc.get("id")
            code = loc.get("code") or loc.get("name")
            if lid is not None and code:
                loc_map[str(lid)] = str(code)
        logger.info(f"Pulpo locations: {len(loc_map)} (sample {list(loc_map.items())[:5]})")
    except PulpoError as e:
        logger.warning(f"Pulpo locations fetch failed: {e}")

    try:
        orders = await pulpo.list_queue_orders(None)  # whole packing queue
        logger.info(f"Pulpo resync: {len(orders)} packing-queue orders pulled")
        if orders:
            import json as _json
            o0 = orders[0]
            logger.info(f"Pulpo sample order FULL: {_json.dumps(o0, default=str)[:2500]}")
            logger.info(f"Pulpo sample order: keys={list(o0.keys())} loc={_extract_location_code(o0, loc_map)!r}")
        pulled_ids: set[str] = set()
        for order in orders:
            oid = order.get("id")
            if oid is None:
                continue
            pulled_ids.add(str(oid))
            await _upsert_queue_order(db, tenant_id, order, product_cache, loc_map)

        # Self-heal: close cached queue orders that are no longer in the queue.
        close_stmt = (
            update(PulpoPackingOrder)
            .where(
                PulpoPackingOrder.tenant_id == tenant_id,
                PulpoPackingOrder.state == "queue",
            )
            .values(state="closed", updated_at=datetime.now(timezone.utc))
        )
        if pulled_ids:
            close_stmt = close_stmt.where(PulpoPackingOrder.pulpo_order_id.notin_(pulled_ids))
        await db.execute(close_stmt)
        await db.flush()
    except PulpoError as e:
        logger.warning(f"Pulpo resync failed: {e} — keeping existing cache")
        return {"ok": False, "error": str(e)}

    pulpo_runtime.last_sync_at = datetime.now(timezone.utc)
    pulpo_runtime.last_sync_orders = len(orders)
    await sync_cw_lists_from_cache(db)
    return {"ok": True, "orders": len(orders)}


def _extract_cartbox(order: dict) -> str:
    """The cart-box / picking-box barcode of an order (multi-order scan id),
    if Pulpo provides one. Defensive across likely field names."""
    for k in ("cart_box_barcode", "cartbox_barcode", "picking_box_barcode",
              "kommissionier_box", "box_barcode", "barcode"):
        v = order.get(k)
        if v:
            return str(v)
    for k in ("cart_box", "cartbox", "picking_box"):
        v = order.get(k)
        if isinstance(v, dict):
            bc = v.get("barcode") or v.get("code") or v.get("name")
            if bc:
                return str(bc)
    return ""


def _extract_location_code(order: dict, loc_map: dict[str, str] | None = None) -> str:
    """The packing location CODE (e.g. 'CW6', 'SACK05') — what Pulpo shows as
    'Lagerplatz'. Tries explicit code fields, then resolves origin_location_id
    via the locations map; falls back to the numeric id."""
    for k in ("origin_location_code", "location_code", "lagerplatz",
              "packing_location_code", "origin_location_name", "destination_location_code"):
        v = order.get(k)
        if v:
            return str(v)
    for k in ("origin_location", "location", "destination_location", "packing_location"):
        v = order.get(k)
        if isinstance(v, dict):
            code = v.get("code") or v.get("name")
            if code:
                return str(code)
    lid = order.get("origin_location_id")
    if lid is not None:
        if loc_map and str(lid) in loc_map:
            return loc_map[str(lid)]
        return str(lid)
    return ""


async def _resolve_ean(item: dict, cache: dict[str, str]) -> str:
    """EAN for a packing item. Webhook payloads embed the full product
    (``item.product.barcodes`` = ['4005…', …]); GET responses carry only
    ``product_id`` → resolved via a product lookup (cached per run)."""
    for key in ("ean", "gtin", "barcode"):
        v = item.get(key)
        if v:
            return str(v)
    prod = item.get("product")
    if isinstance(prod, dict):
        barcodes = prod.get("barcodes")
        if isinstance(barcodes, list) and barcodes:
            first = barcodes[0]
            return str(first.get("barcode") if isinstance(first, dict) else first)
    pid = item.get("product_id") or (prod.get("id") if isinstance(prod, dict) else None)
    if pid is None:
        return ""
    pid = str(pid)
    if pid in cache:
        return cache[pid]
    barcode = ""
    try:
        product = await pulpo.get_product(pid)
        barcodes = (product or {}).get("barcodes") or []
        if barcodes:
            first = barcodes[0]
            barcode = str(first.get("barcode") if isinstance(first, dict) else first)
    except PulpoError:
        barcode = ""
    cache[pid] = barcode
    return barcode


async def _upsert_queue_order(
    db: AsyncSession, tenant_id: str, order: dict, product_cache: dict[str, str],
    loc_map: dict[str, str] | None = None,
) -> None:
    """Upsert one Pulpo queue order (+ its items, EANs resolved) into the cache."""
    pulpo_order_id = order.get("id")
    if pulpo_order_id is None:
        return
    res = await db.execute(
        select(PulpoPackingOrder).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id == str(pulpo_order_id),
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        row = PulpoPackingOrder(tenant_id=tenant_id, pulpo_order_id=str(pulpo_order_id))
        db.add(row)
    row.state = "queue"
    row.pick_location = _extract_location_code(order, loc_map)
    row.cart_box_barcode = _extract_cartbox(order)
    row.raw_payload = order
    row.updated_at = datetime.now(timezone.utc)

    for existing in list(row.items):
        await db.delete(existing)
    row.items = []
    for item in order.get("items") or []:
        ean = await _resolve_ean(item, product_cache)
        db.add(PulpoOrderItem(
            order=row,
            ean=ean,
            product_id=str(item.get("product_id") or ""),
            quantity=int(item.get("requested_quantity") or item.get("quantity") or 1),
            raw_payload=item if isinstance(item, dict) else {},
        ))
