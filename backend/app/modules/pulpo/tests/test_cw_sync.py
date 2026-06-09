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
                db.add(Machine(
                    tenant_id="t1", machine_id="0001", name="CW1000",
                    pulpo_pick_location="CW-A", is_active=True,
                ))
                db.add(Machine(
                    tenant_id="t1", machine_id="0002", name="No-Pulpo",
                    pulpo_pick_location="", is_active=True,   # no location → skipped
                ))
                db.add(_order("t1", "1", "CW-A", "queue", [("111", 2)]))
                await db.commit()
                return await cw_sync.sync_cw_lists_from_cache(db)

        synced = asyncio.run(run())
        assert synced == 1
        lists = cm.get_cw_lists("0001")
        assert PULPO_LIST_NAME in lists
        assert lists[PULPO_LIST_NAME]["source"] == "pulpo"
        assert lists[PULPO_LIST_NAME]["items"]["111"]["expected"] == 2
        assert cm.get_cw_lists("0002") == {}
    finally:
        cw_sync.connection_manager = connection_manager  # restore


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
