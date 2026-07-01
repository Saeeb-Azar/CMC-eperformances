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

import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.logging import logger
from app.gateway.connection import connection_manager
from app.modules.machines.models import Machine

from .client import PulpoError, pulpo
from .models import PulpoOrderItem, PulpoPackingOrder
from .runtime import pulpo_runtime

# Cross-run caches: Lagerplatz-Codes (origin_location_id → "CW10") und
# Produkt-EANs (product_id → barcode) ändern sich praktisch nie. Über die
# Resync-Läufe hinweg gecacht, damit der schnelle Sync-Loop (alle paar Sekunden)
# Pulpo nur mit dem einen Queue-Aufruf belastet, nicht mit N Location/Produkt-
# Lookups pro Durchlauf.
_LOCATION_CACHE: dict[str, str] = {}
_PRODUCT_CACHE: dict[str, str] = {}


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


async def build_cw_orders_by_location(
    db: AsyncSession, tenant_id: str, prefix: str | None,
) -> dict[str, dict[str, list[dict]]]:
    """Pro Lagerplatz UND Barcode die KONKRETEN Aufträge auflisten, die daran
    hängen: ``{location: {barcode: [{pa, sales_order, customer}, …]}}``.

    Damit kann die Zielliste pro EAN zeigen, welche Pulpo-Aufträge (Kunde/
    Verkaufsauftrag) erwartet werden — der Operator sieht VORAB, ob z.B. 3
    Kartons auch 3 verschiedenen Aufträgen entsprechen."""
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

    result: dict[str, dict[str, list[dict]]] = {}
    for o in orders:
        loc = (o.pick_location or "?").strip() or "?"
        bucket = result.setdefault(loc, {})
        rp = o.raw_payload if isinstance(o.raw_payload, dict) else {}
        so = rp.get("sales_order") if isinstance(rp.get("sales_order"), dict) else {}
        ship_to = so.get("ship_to") if isinstance(so.get("ship_to"), dict) else {}
        info = {
            "pa": str(rp.get("sequence_number") or o.pulpo_order_id or ""),
            "sales_order": str(so.get("order_num") or rp.get("sales_order_ref") or ""),
            "customer": str(ship_to.get("name") or so.get("customer_name") or ""),
        }
        # Welche Barcodes adressiert dieser Auftrag? Multi-Order → cart_box,
        # sonst die Artikel-EANs (jeder Auftrag genau EINMAL pro Barcode).
        if o.cart_box_barcode:
            bucket.setdefault(o.cart_box_barcode, []).append(info)
        else:
            for ean in {it.ean for it in o.items if it.ean}:
                bucket.setdefault(ean, []).append(info)
    return result


async def sync_cw_lists_from_cache(db: AsyncSession) -> int:
    """Rebuild the Pulpo CW-Listen of every active machine — one list per
    Lagerplatz. ``pulpo_pick_location`` is the location prefix filter (empty =
    all locations)."""
    machines = (
        await db.execute(select(Machine).where(Machine.is_active.is_(True)))
    ).scalars().all()
    for m in machines:
        prefix = m.pulpo_pick_location or None
        lists = await build_cw_lists_by_location(db, m.tenant_id, prefix)
        orders = await build_cw_orders_by_location(db, m.tenant_id, prefix)
        connection_manager.set_pulpo_cw_lists(m.machine_id, lists, orders_by_list=orders)
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
    product_cache = _PRODUCT_CACHE  # cross-run cache (barcodes are stable)

    try:
        orders = await pulpo.list_queue_orders(None)  # whole packing queue
        logger.info(f"Pulpo resync: {len(orders)} packing-queue orders pulled")

        # Resolve each distinct origin_location_id → Lagerplatz code (e.g.
        # 457127 → "CW10"). Cached across runs, so only ids we've never seen hit
        # the warehouse-locations endpoint.
        loc_map: dict[str, str] = dict(_LOCATION_CACHE)
        for lid in {str(o.get("origin_location_id")) for o in orders if o.get("origin_location_id") is not None}:
            if lid in loc_map:
                continue
            try:
                loc = await pulpo.get_location(lid)
                code = (loc or {}).get("code") or (loc or {}).get("name")
                if code:
                    loc_map[lid] = str(code)
                    _LOCATION_CACHE[lid] = str(code)
            except PulpoError as e:
                logger.warning(f"Pulpo location {lid} lookup failed: {e}")
        logger.info(f"Pulpo locations resolved: {list(loc_map.items())[:8]}")

        if orders:
            import json as _json
            o0 = orders[0]
            logger.info(f"Pulpo sample order FULL: {_json.dumps(o0, default=str)[:2500]}")
            logger.info(f"Pulpo sample order: keys={list(o0.keys())} loc={_extract_location_code(o0, loc_map)!r}")

        # Defensive: we request state=queue, but should Pulpo ever ignore the
        # param and return finished orders too, they must not be upserted as
        # "queue" (they'd resurrect ghost Lagerplätze). Skip clearly terminal
        # states; anything else (queue/taken/missing field) counts as live.
        _TERMINAL = {"ended", "closed", "cancelled", "canceled", "finished", "done"}
        live_orders = []
        for o in orders:
            st = str(o.get("state") or o.get("status") or "").lower()
            if st in _TERMINAL:
                continue
            live_orders.append(o)
        if len(live_orders) != len(orders):
            logger.warning(
                f"Pulpo resync: dropped {len(orders) - len(live_orders)} order(s) "
                f"with terminal state from the queue pull"
            )

        # Diagnostics: Lagerplatz distribution of the LIVE pull — this is what
        # the sidebar SHOULD show. Exposed via the settings status endpoint.
        loc_counts: dict[str, int] = {}
        for o in live_orders:
            code = _extract_location_code(o, loc_map) or "?"
            loc_counts[code] = loc_counts.get(code, 0) + 1
        logger.info(f"Pulpo queue Lagerplatz distribution: {loc_counts}")

        # DB-Last senken: nur GEÄNDERTE Aufträge neu schreiben. Vorher wurde
        # jede Runde JEDER Auftrag (+ alle Artikel-Zeilen) neu geschrieben —
        # bei 444 Aufträgen alle paar Sekunden erschöpft das die DB. Wir laden
        # die vorhandenen raw_payloads EINMAL und überspringen unveränderte.
        cached_raw = dict((await db.execute(
            select(PulpoPackingOrder.pulpo_order_id, PulpoPackingOrder.raw_payload)
            .where(
                PulpoPackingOrder.tenant_id == tenant_id,
                PulpoPackingOrder.state.notin_(("ended", "closed", "cancelled")),
            )
        )).all())

        pulled_ids: set[str] = set()
        skipped = 0
        for order in live_orders:
            oid = order.get("id")
            if oid is None:
                continue
            oid_s = str(oid)
            pulled_ids.add(oid_s)
            # Unverändert (identisches Pulpo-Payload) → nichts zu tun.
            if oid_s in cached_raw and cached_raw[oid_s] == order:
                skipped += 1
                continue
            await _upsert_queue_order(db, tenant_id, order, product_cache, loc_map)
        if skipped:
            logger.info(f"Pulpo resync: {skipped} unveränderte Aufträge übersprungen (DB-Last gespart)")

        # Self-heal: close EVERY non-terminal cached order that the live queue
        # pull no longer returned. The pull is the whole packing queue, so a
        # cached order that's absent has left the queue — regardless of which
        # non-terminal state it currently sits in (queue/taken/draft/locked).
        # (Closing only state=="queue" let orders that a webhook had marked
        # "taken" linger forever, so e.g. CW2/CW9 stayed in the sidebar even
        # though Pulpo only had CW10.)
        close_stmt = (
            update(PulpoPackingOrder)
            .where(
                PulpoPackingOrder.tenant_id == tenant_id,
                PulpoPackingOrder.state.notin_(("ended", "closed", "cancelled")),
                # Demo-/Test-Aufträge (lokal angelegt, nie in Pulpos Queue) vom
                # Self-Heal ausnehmen — sonst schließt der Resync sie sofort.
                ~PulpoPackingOrder.pulpo_order_id.like("TEST-%"),
            )
            .values(state="closed", updated_at=datetime.now(timezone.utc))
        )
        if pulled_ids:
            close_stmt = close_stmt.where(PulpoPackingOrder.pulpo_order_id.notin_(pulled_ids))
        closed = await db.execute(close_stmt)
        await db.flush()
        logger.info(
            f"Pulpo resync self-heal: {closed.rowcount} cached order(s) closed "
            f"(no longer in queue); {len(pulled_ids)} still queued"
        )
    except PulpoError as e:
        logger.warning(f"Pulpo resync failed: {e} — keeping existing cache")
        pulpo_runtime.last_sync_error = str(e)
        pulpo_runtime.last_sync_error_at = datetime.now(timezone.utc)
        return {"ok": False, "error": str(e)}

    pulpo_runtime.last_sync_at = datetime.now(timezone.utc)
    pulpo_runtime.last_sync_orders = len(live_orders)
    pulpo_runtime.last_sync_error = None
    pulpo_runtime.last_locations = loc_counts
    await sync_cw_lists_from_cache(db)
    return {"ok": True, "orders": len(live_orders), "locations": loc_counts}


# Serialisiert ALLE Resync-Läufe im Prozess (Single-Worker). Ohne diesen Lock
# konnten der periodische Loop und ein manueller/Trigger-Resync GLEICHZEITIG
# denselben neuen Pulpo-Auftrag anlegen → check-then-insert-Race →
# „duplicate key … ix_pulpo_orders_tenant_pulpo" → Sync-Loop crasht → Cache
# bleibt stale (alte PAs, Timeouts, falsche „Doppel-Scan"-Auswürfe).
_RESYNC_LOCK = asyncio.Lock()


async def resync_and_rebuild(db: AsyncSession) -> dict[str, Any]:
    """Resync aus Pulpo + CW-Rebuild + commit — SERIALISIERT.

    Der Lock deckt das commit MIT ab: ein zweiter Resync wartet, bis der erste
    committet hat, sieht die Zeilen dann per SELECT und macht ein UPDATE statt
    eines konkurrierenden INSERT. So kann die Unique-Violation nicht mehr
    entstehen."""
    async with _RESYNC_LOCK:
        result = await resync_cache_from_pulpo(db)
        await sync_cw_lists_from_cache(db)
        await db.commit()
    return result


def _looks_like_cartbox(v: object) -> bool:
    """Kommissionier-box-/Multi-Order-Code: Buchstabe(n) + Ziffern, z.B.
    'm030974' / 'M030972' / 'M319991'. EANs (reine Ziffern) sind das NICHT."""
    if not isinstance(v, str):
        return False
    s = v.strip()
    return bool(re.match(r"^[A-Za-z]{1,3}\d{4,}$", s))


def _find_cartbox_in(obj: object) -> str | None:
    """Sucht rekursiv nach einer Kommissionier-box (M-Nummer) — bevorzugt in
    expliziten cart_box-Feldern, sonst per Muster. Pulpo hängt sie pro Artikel
    in die ``batches`` (``cart_box``), nicht oben an den Auftrag."""
    if isinstance(obj, str):
        return obj.strip() if _looks_like_cartbox(obj) else None
    if isinstance(obj, dict):
        for k in ("cart_box", "cartbox", "picking_box", "kommissionier_box"):
            v = obj.get(k)
            if isinstance(v, dict):
                for bk in ("barcode", "code", "name"):
                    if _looks_like_cartbox(v.get(bk)):
                        return str(v.get(bk)).strip()
            elif _looks_like_cartbox(v):
                return str(v).strip()
        for k in ("cart_box_barcode", "cartbox_barcode", "picking_box_barcode", "box_barcode"):
            if _looks_like_cartbox(obj.get(k)):
                return str(obj.get(k)).strip()
        for v in obj.values():
            r = _find_cartbox_in(v)
            if r:
                return r
    if isinstance(obj, list):
        for v in obj:
            r = _find_cartbox_in(v)
            if r:
                return r
    return None


def _extract_cartbox(order: dict) -> str:
    """The cart-box / picking-box barcode of an order (multi-order scan id),
    if Pulpo provides one. Defensive across likely field names — UND gräbt in
    die Items/Batches, weil Pulpo die Kommissionier-box (M-Nummer) pro Artikel
    dort ablegt, nicht oben am Auftrag. So landet die M-Nummer in der CW-Liste,
    statt nur die Produkt-EANs (sonst: 'M erkannt, aber nicht in CW-Liste')."""
    def _norm(s: str) -> str:
        # Kommissionier-box GROSS normalisieren (passt zum groß normalisierten
        # Scan); reine Ziffern bleiben unverändert.
        return s.strip().upper() if any(c.isalpha() for c in s) else s.strip()

    for k in ("cart_box_barcode", "cartbox_barcode", "picking_box_barcode",
              "kommissionier_box", "box_barcode", "barcode"):
        v = order.get(k)
        if v:
            return _norm(str(v))
    for k in ("cart_box", "cartbox", "picking_box"):
        v = order.get(k)
        if isinstance(v, dict):
            bc = v.get("barcode") or v.get("code") or v.get("name")
            if bc:
                return _norm(str(bc))
    # NEU: M-Nummer aus den Items/Batches (Kommissionier-box) holen.
    found = _find_cartbox_in(order.get("items"))
    if found:
        return _norm(found)
    return ""
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


async def get_or_create_order_row(
    db: AsyncSession, tenant_id: str, pulpo_order_id: str,
) -> tuple[PulpoPackingOrder, bool]:
    """Race-sichere Zeile für (tenant, pulpo_order_id): atomar anlegen ODER die
    bestehende zurückgeben. Gibt ``(row, created)``.

    Behebt den Feld-Crash „duplicate key … ix_pulpo_orders_tenant_pulpo": der
    periodische Resync-Loop UND der Pulpo-Webhook legen denselben neuen Auftrag
    zeitgleich an; check-then-insert sah in beiden „nicht da" → doppeltes
    INSERT. ``INSERT … ON CONFLICT DO NOTHING`` wartet auf die konkurrierende
    Transaktion und legt KEIN Duplikat an; danach existiert die Zeile garantiert.
    """
    poid = str(pulpo_order_id)
    dname = db.bind.dialect.name
    if dname == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as _ins
    else:  # sqlite (Tests/Dev) unterstützt on_conflict ebenfalls
        from sqlalchemy.dialects.sqlite import insert as _ins
    now = datetime.now(timezone.utc)
    stmt = (
        _ins(PulpoPackingOrder)
        .values(id=str(uuid.uuid4()), tenant_id=tenant_id, pulpo_order_id=poid,
                state="queue", created_at=now, updated_at=now)
        .on_conflict_do_nothing(index_elements=["tenant_id", "pulpo_order_id"])
    )
    res = await db.execute(stmt)
    await db.flush()
    row = (await db.execute(
        select(PulpoPackingOrder).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id == poid,
        )
    )).scalar_one()
    return row, bool(res.rowcount and res.rowcount > 0)


async def _upsert_queue_order(
    db: AsyncSession, tenant_id: str, order: dict, product_cache: dict[str, str],
    loc_map: dict[str, str] | None = None,
) -> None:
    """Upsert one Pulpo queue order (+ its items, EANs resolved) into the cache."""
    pulpo_order_id = order.get("id")
    if pulpo_order_id is None:
        return
    row, _created = await get_or_create_order_row(db, tenant_id, str(pulpo_order_id))
    row.state = "queue"
    row.pick_location = _extract_location_code(order, loc_map)
    row.cart_box_barcode = _extract_cartbox(order)
    row.raw_payload = order
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()  # ensure row.id exists before (re)writing items

    # Replace items via explicit query — never touch row.items (would lazy-load
    # outside the async context → greenlet error).
    await db.execute(delete(PulpoOrderItem).where(PulpoOrderItem.order_db_id == row.id))
    for item in order.get("items") or []:
        ean = await _resolve_ean(item, product_cache)
        prod = item.get("product") if isinstance(item.get("product"), dict) else {}
        db.add(PulpoOrderItem(
            order_db_id=row.id,
            ean=ean,
            product_id=str(item.get("product_id") or prod.get("id") or prod.get("sku") or ""),
            product_name=str(prod.get("name") or ""),
            quantity=int(item.get("requested_quantity") or item.get("quantity") or 1),
            raw_payload=item if isinstance(item, dict) else {},
        ))
