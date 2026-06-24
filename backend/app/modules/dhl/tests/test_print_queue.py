"""Druck-Queue: physische Reihenfolge + Auswurf-Gate (Fix gegen versetzte
und verwaiste Labels).

Deckt ab:
  - Sortierung nach OrderState.enq_sequence (physische Scan-Reihenfolge),
    NICHT nach Shipment.created_at (async Precreate-Jitter).
  - Status-Gate: nur SCANNED/LABELED/COMPLETED werden ausgeliefert; ASSIGNED/
    INDUCTED (noch vor Auswurf-Entscheidung) und DELETED/EJECTED/FAILED nicht.
  - Ungebundene Sendungen (order_state_id=None, z.B. Test-Labels) drucken weiter.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.dhl.models import Shipment
from app.modules.dhl.router import get_print_queue

TENANT = "t1"
MACHINE = "m1"
T0 = datetime(2026, 6, 24, 10, 0, 0, tzinfo=timezone.utc)


async def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return sm


def _os(seq: int, ref: str, state: str) -> OrderState:
    return OrderState(
        tenant_id=TENANT, machine_db_id=MACHINE, reference_id=ref,
        barcode=f"EAN{seq}", state=state, enq_sequence=seq,
    )


def _ship(ref: str, created: datetime, os_id: str | None) -> Shipment:
    return Shipment(
        tenant_id=TENANT, reference_id=ref, barcode=ref.upper(),
        tracking_number=f"TRACK-{ref}", label_b64="QkFTRTY0", label_format="PDF",
        created_at=created, order_state_id=os_id,
    )


async def _seed(db):
    db.add(Tenant(id=TENANT, name="T", slug="t"))
    db.add(Machine(id=MACHINE, tenant_id=TENANT, machine_id="0001", name="CW", enq_sequence=5))

    # Drei druckbare Pakete. created_at ist BEWUSST gegenläufig zur enq_sequence:
    # seq1 zuletzt erzeugt, seq3 zuerst — so würde created_at-Sortierung sie
    # vertauschen (genau der versetzte-Label-Bug). Erwartet: seq-Reihenfolge.
    os1 = _os(1, "ref1", "SCANNED")
    os2 = _os(2, "ref2", "LABELED")
    os3 = _os(3, "ref3", "COMPLETED")
    # Noch nicht über die Auswurf-Entscheidung → NICHT drucken.
    os4 = _os(4, "ref4", "INDUCTED")
    os5 = _os(5, "ref5", "ASSIGNED")
    # Ausgeworfen / verworfen → NIE drucken (sonst verwaistes Label).
    os6 = _os(6, "ref6", "DELETED")
    os7 = _os(7, "ref7", "EJECTED")
    for o in (os1, os2, os3, os4, os5, os6, os7):
        db.add(o)
    await db.flush()

    db.add(_ship("ref1", T0 + timedelta(seconds=30), os1.id))  # spät erzeugt
    db.add(_ship("ref2", T0 + timedelta(seconds=20), os2.id))
    db.add(_ship("ref3", T0 + timedelta(seconds=10), os3.id))  # früh erzeugt
    db.add(_ship("ref4", T0, os4.id))
    db.add(_ship("ref5", T0, os5.id))
    db.add(_ship("ref6", T0, os6.id))
    db.add(_ship("ref7", T0, os7.id))
    # Ungebundenes Test-Label ohne State → muss weiterhin druckbar sein.
    db.add(_ship("reftest", T0 + timedelta(seconds=5), None))
    await db.commit()


@pytest.mark.asyncio
async def test_queue_ordered_by_enq_sequence_not_created_at():
    sm = await _fresh_db()
    async with sm() as db:
        await _seed(db)
        items = await get_print_queue(limit=50, db=db, user={"tenant_id": TENANT})

    refs = [i.reference_id for i in items]
    bound = [r for r in refs if r != "reftest"]
    # Physische Reihenfolge nach enq_sequence — NICHT nach created_at (das wäre
    # ref3, ref2, ref1).
    assert bound == ["ref1", "ref2", "ref3"], refs


@pytest.mark.asyncio
async def test_queue_gates_on_state():
    sm = await _fresh_db()
    async with sm() as db:
        await _seed(db)
        items = await get_print_queue(limit=50, db=db, user={"tenant_id": TENANT})

    refs = set(i.reference_id for i in items)
    # Druckbar: über Auswurf-Entscheidung hinaus.
    assert {"ref1", "ref2", "ref3"} <= refs
    # Ungebundenes Test-Label bleibt druckbar.
    assert "reftest" in refs
    # Vor Auswurf-Entscheidung → noch nicht drucken.
    assert "ref4" not in refs and "ref5" not in refs
    # Ausgeworfen/verworfen → niemals drucken.
    assert "ref6" not in refs and "ref7" not in refs
