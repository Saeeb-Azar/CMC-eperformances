"""CW-Liste ↔ Pulpo packing-queue sync.

The CW-Liste of a machine is derived automatically from the Pulpo packing
queue at the machine's ``pulpo_pick_location`` — it is never edited by hand.

Two mechanisms keep it live:
  1. Webhook-driven (primary): packing_order_created/finished update the local
     cache (pulpo_packing_orders/items); afterwards we rebuild the affected
     machines' CW-Listen straight from that cache — no Pulpo call needed.
  2. Periodic resync (self-heal, cmc-process-doc § 3): pull the queue from
     Pulpo for each location into the cache, then rebuild. Covers missed
     webhooks. Only runs when the Pulpo client is configured.

``sync_cw_lists_from_cache`` is the pure, DB-only core (unit-tested).
``resync_cache_from_pulpo`` is the network part and is best-effort/defensive.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.gateway.connection import connection_manager
from app.modules.machines.models import Machine

from .client import PulpoError, pulpo
from .models import PulpoOrderItem, PulpoPackingOrder


async def build_cw_items_for_location(
    db: AsyncSession, tenant_id: str, pick_location: str,
) -> dict[str, int]:
    """Aggregate barcode → expected-quantity for all queued Pulpo orders at a
    pick location. DB-side GROUP BY on the cached order items."""
    stmt = (
        select(PulpoOrderItem.ean, func.sum(PulpoOrderItem.quantity))
        .join(PulpoPackingOrder, PulpoOrderItem.order_db_id == PulpoPackingOrder.id)
        .where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.state == "queue",
            PulpoPackingOrder.pick_location == pick_location,
            PulpoOrderItem.ean != "",
        )
        .group_by(PulpoOrderItem.ean)
    )
    rows = (await db.execute(stmt)).all()
    return {ean: int(qty or 0) for ean, qty in rows if ean}


async def sync_cw_lists_from_cache(db: AsyncSession) -> int:
    """Rebuild every machine's Pulpo CW-Liste from the local cache. Returns
    the number of machines synced. Pure DB work — safe to call often."""
    machines = (
        await db.execute(
            select(Machine).where(
                Machine.is_active.is_(True),
                Machine.pulpo_pick_location != "",
            )
        )
    ).scalars().all()
    for m in machines:
        items = await build_cw_items_for_location(db, m.tenant_id, m.pulpo_pick_location)
        # protocol_id used by the gateway is the machine's machine_id ("0001").
        connection_manager.set_pulpo_cw_list(m.machine_id, items)
    return len(machines)


async def resync_cache_from_pulpo(db: AsyncSession) -> dict[str, Any]:
    """Self-heal: pull the live queue from Pulpo for every configured pick
    location into the cache (filling EANs via product lookup), then rebuild
    the CW-Listen. Best-effort — a Pulpo failure is logged, not raised.

    NOTE: the exact Pulpo payload field names are validated against live data;
    extraction here is defensive and mirrors the webhook service.
    """
    if not pulpo.configured:
        return {"ok": False, "reason": "pulpo not configured"}

    # Distinct pick locations across active machines.
    locations = {
        loc for (loc,) in (
            await db.execute(
                select(Machine.pulpo_pick_location).where(
                    Machine.is_active.is_(True), Machine.pulpo_pick_location != "",
                )
            )
        ).all() if loc
    }
    if not locations:
        return {"ok": True, "locations": 0}

    from .service import _get_default_tenant_id  # local import avoids a cycle
    tenant_id = await _get_default_tenant_id(db)
    product_barcode_cache: dict[str, str] = {}
    synced = 0
    try:
        for location in locations:
            orders = await pulpo.list_queue_orders(location)
            for order in orders:
                await _upsert_queue_order(db, tenant_id, location, order, product_barcode_cache)
                synced += 1
        await db.flush()
    except PulpoError as e:
        logger.warning(f"Pulpo resync failed: {e} — keeping existing cache")
        return {"ok": False, "error": str(e)}

    await sync_cw_lists_from_cache(db)
    return {"ok": True, "locations": len(locations), "orders": synced}


async def _resolve_ean(item: dict, cache: dict[str, str]) -> str:
    """EAN for a packing item — directly from the item if present, else
    resolved via the product's first barcode (cached per run)."""
    for key in ("ean", "gtin", "barcode"):
        v = item.get(key)
        if v:
            return str(v)
    pid = item.get("product_id")
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
    db: AsyncSession, tenant_id: str, location: str, order: dict, product_cache: dict[str, str],
) -> None:
    """Upsert one Pulpo queue order (+ its items, with EANs resolved) into the
    cache. Only touches queue orders pulled from the live API."""
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
    row.pick_location = location
    row.raw_payload = order
    row.updated_at = datetime.now(timezone.utc)

    # Replace items (queue contents are authoritative on resync).
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
