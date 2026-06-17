"""box_closed „Manual Pack Race"-Schutz (Fix-Brief Schritt 7): läuft die Order
gerade auf der Maschine (aktiver OrderState) → Label-Erzeugung überspringen."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.pulpo import models as _pulpo  # noqa: F401
from app.modules.pulpo import service

TENANT = "t1"
POID = "PO-77"


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(init())
    return sm


async def _base(db):
    db.add(Tenant(id=TENANT, name="T", slug="t"))
    db.add(Machine(id="m1", tenant_id=TENANT, machine_id="0001", name="CW", enq_sequence=1))
    await db.commit()


def test_box_closed_skips_when_machine_active():
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            await _base(db)
            db.add(OrderState(tenant_id=TENANT, machine_db_id="m1", reference_id="ref0001",
                              barcode="4005", state="LABELED", enq_sequence=1, pulpo_order_id=POID))
            await db.commit()
            res = await service.handle_box_closed(db, {"packing_order_id": POID})
            assert res["skip_label"] is True, res
    asyncio.run(run())


def test_box_closed_no_skip_for_manual_pack():
    sm = _fresh_db()

    async def run():
        async with sm() as db:
            await _base(db)
            # kein aktiver Maschinen-State zu dieser Order
            res = await service.handle_box_closed(db, {"packing_order_id": POID})
            assert res["skip_label"] is False, res
    asyncio.run(run())


if __name__ == "__main__":  # pragma: no cover
    test_box_closed_skips_when_machine_active()
    test_box_closed_no_skip_for_manual_pack()
    print("OK")
