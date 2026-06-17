"""END status=1 muss den deferred Pulpo-Replay DURABEL anstoßen:
pulpo_replay_state geht sofort (in derselben Transaktion wie COMPLETED) auf
PENDING — damit der Replay-Sweeper ihn garantiert aufgreift und nie ein fertiges
Paket still in Pulpo offen bleibt."""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.pulpo import models as _pulpo  # noqa: F401
from app.gateway.persistence import _apply_event

TENANT = "t1"


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(init())
    return sm


async def _setup(db, *, pulpo_order_id):
    db.add(Tenant(id=TENANT, name="T", slug="t"))
    m = Machine(id="m1", tenant_id=TENANT, machine_id="0001", name="CW", enq_sequence=5)
    db.add(m)
    db.add(OrderState(
        tenant_id=TENANT, machine_db_id="m1", reference_id="ref0001", barcode="4005",
        state="LABELED", enq_sequence=5, pulpo_order_id=pulpo_order_id,
        pulpo_replay_state="NONE",
    ))
    await db.commit()
    return m


def test_end_status1_sets_replay_pending_when_bound():
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            m = await _setup(db, pulpo_order_id="PO-9")
            await _apply_event(db, m, "END", {"reference_id": "ref0001", "status": "1"})
            await db.commit()
            o = (await db.execute(
                select(OrderState).where(OrderState.reference_id == "ref0001")
            )).scalar_one()
            assert o.state == "COMPLETED"
            assert o.pulpo_replay_state == "PENDING"   # durabel angestoßen

    asyncio.run(run())


def test_end_status1_without_binding_stays_none():
    # Ohne pulpo_order_id gibt es nichts zurückzuschreiben → kein PENDING
    # (sonst würde der Sweeper endlos einen nicht-bindbaren Auftrag aufgreifen).
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            m = await _setup(db, pulpo_order_id=None)
            await _apply_event(db, m, "END", {"reference_id": "ref0001", "status": "1"})
            await db.commit()
            o = (await db.execute(
                select(OrderState).where(OrderState.reference_id == "ref0001")
            )).scalar_one()
            assert o.state == "COMPLETED"
            assert o.pulpo_replay_state in (None, "NONE")

    asyncio.run(run())


def test_clean_completed_clears_stale_reject_fields():
    # Ein altes ejection_reason (z.B. 'manual: …') darf an einem sauberen
    # COMPLETED nicht hängenbleiben (sonst falsche Anzeige in „Alle Infos").
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            m = await _setup(db, pulpo_order_id="PO-9")
            o = (await db.execute(
                select(OrderState).where(OrderState.reference_id == "ref0001")
            )).scalar_one()
            o.ejection_reason = "manual: Testauswurf"
            o.resolution_reason = "irgendwas"
            o.failure_resolved = True
            await db.commit()
            await _apply_event(db, m, "END", {"reference_id": "ref0001", "status": "1"})
            await db.commit()
            o2 = (await db.execute(
                select(OrderState).where(OrderState.reference_id == "ref0001")
            )).scalar_one()
            assert o2.state == "COMPLETED"
            assert o2.ejection_reason is None
            assert o2.resolution_reason is None
            assert o2.failure_resolved is False

    asyncio.run(run())


if __name__ == "__main__":  # pragma: no cover
    test_end_status1_sets_replay_pending_when_bound()
    test_end_status1_without_binding_stays_none()
    test_clean_completed_clears_stale_reject_fields()
    print("OK")
