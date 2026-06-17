"""Die bei LAB1 aufgelöste Lieferadresse (ship_to fürs Label) wird am OrderState
persistiert → Dashboard zeigt sie ohne Live-Call (Anzeige == Label)."""

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
from app.modules.dhl.client import Address
from app.gateway.connection import ConnectionManager

TENANT = "t1"
PROTO = "0001"


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(init())
    return sm


def test_persist_recipient_on_order():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            db.add(Tenant(id=TENANT, name="T", slug="t"))
            db.add(Machine(id="m1", tenant_id=TENANT, machine_id=PROTO, name="CW", enq_sequence=1))
            db.add(OrderState(
                tenant_id=TENANT, machine_db_id="m1", reference_id="ref0021",
                barcode="4005", state="LABELED", enq_sequence=1,
            ))
            await db.commit()

            addr = Address(
                name="Robert Narloch", street="Pönitzer Chaussee", street_no="15b",
                zip_code="23683", city="Scharbeutz", country="DEU",
                email="r@x.de", phone="0451 1",
            )
            await cm._persist_recipient_on_order(db, PROTO, "ref0021", addr)

            o = (await db.execute(
                select(OrderState).where(OrderState.reference_id == "ref0021")
            )).scalar_one()
            assert o.recipient_name == "Robert Narloch"
            assert o.recipient_street == "Pönitzer Chaussee"
            assert o.recipient_house_no == "15b"
            assert o.recipient_zip == "23683"
            assert o.recipient_city == "Scharbeutz"
            assert o.recipient_country == "DEU"

    asyncio.run(run())


if __name__ == "__main__":  # pragma: no cover
    test_persist_recipient_on_order()
    print("OK")
