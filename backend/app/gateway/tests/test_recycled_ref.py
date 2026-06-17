"""Recyceltes reference_id (gleicher ref-String in neuer Session) darf ein bereits
TERMINALES OrderState-Dokument NICHT überschreiben — es muss ein FRISCHES Dokument
mit eigener enq_sequence entstehen (sonst trägt ein Dokument Daten zweier Pakete)."""

from __future__ import annotations

import asyncio

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.pulpo import models as _pulpo  # noqa: F401
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


def test_recycled_ref_creates_new_document():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            db.add(Tenant(id=TENANT, name="T", slug="t"))
            db.add(Machine(id="m1", tenant_id=TENANT, machine_id=PROTO, name="CW", enq_sequence=0))
            await db.commit()

            # Paket 1: bindet ref0001
            os1 = await cm._bind_order_state(db, PROTO, "ref0001", "4005", None)
            await db.commit()
            seq1 = os1.enq_sequence
            # … läuft durch → terminal
            os1.state = "COMPLETED"
            await db.commit()

            # Paket 2: SELBES ref0001 (recycelt) → darf os1 NICHT überschreiben
            os2 = await cm._bind_order_state(db, PROTO, "ref0001", "4005", None)
            await db.commit()

            assert os2.id != os1.id, "recyceltes ref hat das alte Dokument überschrieben!"
            assert os2.state == "ASSIGNED"
            assert os2.enq_sequence > seq1            # eigene, monoton steigende Sequenz
            # os1 bleibt terminal & unverändert
            refreshed = (await db.execute(
                select(OrderState).where(OrderState.id == os1.id)
            )).scalar_one()
            assert refreshed.state == "COMPLETED"
            # genau zwei Dokumente für ref0001
            n = (await db.execute(
                select(func.count()).select_from(OrderState)
                .where(OrderState.reference_id == "ref0001")
            )).scalar_one()
            assert n == 2, n

    asyncio.run(run())


if __name__ == "__main__":  # pragma: no cover
    test_recycled_ref_creates_new_document()
    print("OK")
