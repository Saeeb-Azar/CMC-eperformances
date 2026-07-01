"""Tests for the Pulpo → CW-Liste sync (DB-only core, in-memory SQLite)."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base

# Import all model modules so create_all sees every table referenced by FKs.
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants import models as _tenants  # noqa: F401
from app.modules.machines.models import Machine
from app.modules.orders import models as _orders  # noqa: F401
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder

from app.gateway.connection import PULPO_LIST_NAME, ConnectionManager, connection_manager
from app.modules.pulpo import cw_sync


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(init())
    return sm


def _order(tenant, oid, loc, state, items):
    o = PulpoPackingOrder(tenant_id=tenant, pulpo_order_id=oid, pick_location=loc, state=state)
    o.items = [PulpoOrderItem(ean=e, quantity=q) for e, q in items]
    return o


def test_build_cw_items_aggregates_queue_orders_at_location():
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            db.add_all([
                _order("t1", "1", "CW-A", "queue", [("111", 2), ("222", 1)]),
                _order("t1", "2", "CW-A", "queue", [("111", 3)]),
                _order("t1", "3", "CW-A", "closed", [("999", 5)]),   # wrong state
                _order("t1", "4", "CW-B", "queue", [("888", 1)]),    # wrong location
                _order("t1", "5", "CW-A", "queue", [("", 4)]),       # empty EAN skipped
            ])
            await db.commit()
            return await cw_sync.build_cw_items_for_location(db, "t1", "CW-A")

    items = asyncio.run(run())
    assert items == {"111": 5, "222": 1}


def test_sync_pushes_list_into_connection_manager():
    sm = _fresh_db()
    cm = ConnectionManager()
    # Point the module's connection_manager at a throwaway instance.
    cw_sync.connection_manager = cm
    try:
        async def run():
            async with sm() as db:
                # machine with a location filter → only that location's orders
                db.add(Machine(tenant_id="t1", machine_id="0001", name="CW",
                               pulpo_pick_location="100", is_active=True))
                # machine without a location → the WHOLE queue
                db.add(Machine(tenant_id="t1", machine_id="0002", name="All",
                               pulpo_pick_location="", is_active=True))
                db.add(_order("t1", "1", "100", "queue", [("111", 2)]))
                db.add(_order("t1", "2", "200", "queue", [("222", 3)]))
                await db.commit()
                return await cw_sync.sync_cw_lists_from_cache(db)

        synced = asyncio.run(run())
        assert synced == 2
        # 0001 prefix "100" → one list named after the location "100"
        lists1 = cm.get_cw_lists("0001")
        assert set(lists1.keys()) == {"100"}
        assert lists1["100"]["source"] == "pulpo"
        assert lists1["100"]["items"] == {"111": {"expected": 2, "consumed": 0}}
        # 0002 no prefix → one list per location (100 + 200)
        lists2 = cm.get_cw_lists("0002")
        assert set(lists2.keys()) == {"100", "200"}
        assert lists2["200"]["items"] == {"222": {"expected": 3, "consumed": 0}}
    finally:
        cw_sync.connection_manager = connection_manager  # restore


def test_orders_per_barcode_flow_into_serialized_list():
    """Gleiche EAN, mehrere Aufträge → die Zielliste muss pro Barcode die
    konkreten Aufträge (PA/Verkaufsauftrag/Kunde) mitführen, damit der Operator
    vorab sieht, welche Aufträge erwartet werden."""
    sm = _fresh_db()
    cm = ConnectionManager()
    cw_sync.connection_manager = cm
    try:
        async def run():
            async with sm() as db:
                db.add(Machine(tenant_id="t1", machine_id="0001", name="CW",
                               pulpo_pick_location="", is_active=True))
                for oid, cust, son in (("9", "Jochen Heide", "302-1"),
                                        ("8", "Arjan Singha", "306-2")):
                    o = PulpoPackingOrder(
                        tenant_id="t1", pulpo_order_id=oid, pick_location="CW29",
                        state="queue",
                        raw_payload={"sequence_number": f"PA-{oid}",
                                     "sales_order": {"order_num": son,
                                                     "ship_to": {"name": cust}}},
                    )
                    o.items = [PulpoOrderItem(ean="4005", quantity=1)]
                    db.add(o)
                await db.commit()
                await cw_sync.sync_cw_lists_from_cache(db)

        asyncio.run(run())
        serialized = cm.cw_lists["0001"]
        cw29 = next(l for l in serialized if l["name"] == "CW29")
        row = next(r for r in cw29["items"] if r["barcode"] == "4005")
        assert row["expected"] == 2
        pas = sorted(o["pa"] for o in row["orders"])
        assert pas == ["PA-8", "PA-9"], row["orders"]
        customers = sorted(o["customer"] for o in row["orders"])
        assert customers == ["Arjan Singha", "Jochen Heide"]
    finally:
        cw_sync.connection_manager = connection_manager


def test_resync_deletes_orders_absent_from_queue():
    """Pulpo-Daten sind nur ein LIVE-Cache: Aufträge, die nicht mehr in der
    Queue sind, werden beim Resync GELÖSCHT (samt Items) — nicht ewig behalten.
    Verhindert das unbegrenzte Anwachsen der Tabellen (DB-Überlauf)."""
    from sqlalchemy import select as _sel
    from app.modules.tenants.models import Tenant as _Tenant
    sm = _fresh_db()
    cm = ConnectionManager()
    orig_pulpo = cw_sync.pulpo
    orig_cm = cw_sync.connection_manager
    cw_sync.connection_manager = cm

    class _FakePulpo:
        configured = True
        async def list_queue_orders(self, _loc):
            return [{"id": 111, "state": "queue",
                     "items": [{"product": {"barcodes": ["4005"], "sku": "X", "name": "Art"},
                                "quantity": 1}]}]
        async def get_location(self, _lid):
            return {"code": "CW1"}

    cw_sync.pulpo = _FakePulpo()
    try:
        async def run():
            async with sm() as db:
                db.add(_Tenant(id="t1", name="T", slug="t"))
                db.add(Machine(tenant_id="t1", machine_id="0001", name="CW",
                               pulpo_pick_location="", is_active=True))
                for oid in ("111", "222"):  # 111 bleibt in Queue, 222 nicht mehr
                    o = PulpoPackingOrder(tenant_id="t1", pulpo_order_id=oid,
                                          state="queue", pick_location="CW1", raw_payload={})
                    o.items = [PulpoOrderItem(ean="4005", quantity=1)]
                    db.add(o)
                await db.commit()

                await cw_sync.resync_and_rebuild(db)

                ids = [r for (r,) in (await db.execute(
                    _sel(PulpoPackingOrder.pulpo_order_id))).all()]
                assert "111" in ids and "222" not in ids, ids
                # Items von 222 ebenfalls weg (keine verwaisten Zeilen).
                items = (await db.execute(_sel(PulpoOrderItem))).scalars().all()
                assert len(items) == 1, len(items)

        asyncio.run(run())
    finally:
        cw_sync.pulpo = orig_pulpo
        cw_sync.connection_manager = orig_cm


def test_get_or_create_order_row_is_race_idempotent():
    """Zweifacher get_or_create für dieselbe (tenant, pulpo_order_id) → EINE
    Zeile, kein duplicate-key. created=True nur beim ersten Mal. (Deckt die
    Insert-Race zwischen Resync-Loop und Webhook ab.)"""
    from sqlalchemy import select as _sel
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            r1, c1 = await cw_sync.get_or_create_order_row(db, "t1", "12345")
            await db.commit()
            r2, c2 = await cw_sync.get_or_create_order_row(db, "t1", "12345")
            await db.commit()
            assert c1 is True and c2 is False
            assert r1.id == r2.id
            rows = (await db.execute(
                _sel(PulpoPackingOrder).where(PulpoPackingOrder.pulpo_order_id == "12345")
            )).scalars().all()
            assert len(rows) == 1

    asyncio.run(run())


def test_set_pulpo_cw_list_preserves_consumed_and_marks_source():
    cm = ConnectionManager()
    cm.set_pulpo_cw_list("M1", {"A": 2, "B": 1})
    assert cm.consume_cw_entry("M1", PULPO_LIST_NAME, "A") is True  # consumed A → 1

    # Queue refresh: A now expected 5, B gone, C new.
    serialized = cm.set_pulpo_cw_list("M1", {"A": 5, "C": 3})
    items = cm.get_cw_lists("M1")[PULPO_LIST_NAME]["items"]
    assert items["A"] == {"expected": 5, "consumed": 1}   # consumed survived
    assert "B" not in items                                # dropped from queue
    assert items["C"] == {"expected": 3, "consumed": 0}
    assert serialized["source"] == "pulpo"


def test_empty_and_nonpositive_quantities_are_skipped():
    cm = ConnectionManager()
    cm.set_pulpo_cw_list("M2", {"A": 0, "  ": 5, "B": 2})
    items = cm.get_cw_lists("M2")[PULPO_LIST_NAME]["items"]
    assert items == {"B": {"expected": 2, "consumed": 0}}


if __name__ == "__main__":
    import inspect, sys
    mod = sys.modules[__name__]
    failures = 0
    for name, fn in sorted(inspect.getmembers(mod, inspect.isfunction)):
        if name.startswith("test_"):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failures += 1
                import traceback; traceback.print_exc()
                print(f"FAIL {name}: {e!r}")
    sys.exit(1 if failures else 0)
