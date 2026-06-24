"""ENQ-Bindung läuft UNABHÄNGIG von der CW-Liste.

Regression gegen den Doppel-Label-Bug aus dem Feld: die Maschine lief ohne
Kommissionierliste, dadurch wurde der Pulpo-Auftrag NICHT gebunden. Bei LAB1
griff die Label-Auflösung den ältesten EAN-Treffer (.limit(1)) → alle Pakete
mit gleicher EAN bekamen dasselbe Label (PA-0608760 „Tera Ponce"), die
Maschine warf 4 von 5 als Duplikat aus.

Diese Tests rufen _enq_claim_and_bind OHNE matched_cw_list auf und prüfen, dass
trotzdem distinkte Aufträge gebunden werden — und der Überzähler sauber
abgelehnt wird statt ein Duplikat zu bekommen.

Hinweis: bewusst @pytest.mark.asyncio (kein asyncio.run) — asyncio.run würde
den Event-Loop schließen und nachfolgende (sync) Tests im Gesamtlauf stören.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder
from app.gateway.connection import ConnectionManager

TENANT = "t1"
PROTO = "0001"
EAN = "4005240004579"


async def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return sm


async def _seed(db, n=3):
    db.add(Tenant(id=TENANT, name="T", slug="t"))
    db.add(Machine(id="m1", tenant_id=TENANT, machine_id=PROTO, name="CW", enq_sequence=0))
    base = datetime(2026, 6, 1, tzinfo=timezone.utc)
    for k, lab in enumerate(["A", "B", "C", "D", "E"][:n]):
        o = PulpoPackingOrder(
            tenant_id=TENANT, pulpo_order_id=f"PA-{lab}", state="queue",
            cart_box_barcode="", created_at=base + timedelta(minutes=k),
            raw_payload={"sequence_number": f"PA-{lab}"},
        )
        o.items = [PulpoOrderItem(ean=EAN, quantity=1, product_name=f"Artikel {lab}")]
        db.add(o)
    await db.commit()


@pytest.mark.asyncio
async def test_binds_without_cw_list():
    """Kein matched_cw_list → trotzdem distinkte Bindung pro Paket."""
    sm = await _fresh_db()
    cm = ConnectionManager()
    async with sm() as db:
        await _seed(db, n=3)

    bound = []
    for i in range(3):
        resp = {"result": 1, "reference_id": f"ref{i+1:04d}"}
        md = {"barcode": EAN}
        poid = await cm._enq_claim_and_bind(
            PROTO, f"ref{i+1:04d}", EAN,
            matched_cw_list=None, filter_passed=False,
            response=resp, msg_data=md, session_factory=sm,
        )
        assert resp["result"] == 1, f"Scan {i+1} fälschlich abgelehnt: {resp}"
        assert poid == md.get("pulpo_order_id")
        bound.append(poid)

    # Drei Pakete, drei VERSCHIEDENE Aufträge — kein doppeltes Label.
    assert set(bound) == {"PA-A", "PA-B", "PA-C"}, bound

    # Bindung ist auch in der DB persistiert (order_state.pulpo_order_id).
    async with sm() as db:
        rows = (await db.execute(
            select(OrderState.reference_id, OrderState.pulpo_order_id)
            .order_by(OrderState.enq_sequence)
        )).all()
    assert {r[1] for r in rows} == {"PA-A", "PA-B", "PA-C"}, rows


@pytest.mark.asyncio
async def test_overscan_without_cw_list_rejected():
    """Vierter Scan ohne freien Auftrag → no_free_order-Reject statt Duplikat."""
    from app.modules.pulpo.runtime import pulpo_runtime
    sm = await _fresh_db()
    cm = ConnectionManager()
    prev = pulpo_runtime.test_mode
    pulpo_runtime.test_mode = False  # Live: Überzähler hart ablehnen
    try:
        async with sm() as db:
            await _seed(db, n=3)

        for i in range(3):
            resp = {"result": 1, "reference_id": f"ref{i+1:04d}"}
            await cm._enq_claim_and_bind(
                PROTO, f"ref{i+1:04d}", EAN, response=resp,
                msg_data={"barcode": EAN}, session_factory=sm,
            )
            assert resp["result"] == 1

        resp4 = {"result": 1, "reference_id": "ref0004"}
        md4 = {"barcode": EAN}
        poid = await cm._enq_claim_and_bind(
            PROTO, "ref0004", EAN, response=resp4, msg_data=md4, session_factory=sm,
        )
        assert poid is None
        assert resp4["result"] == 0
        assert resp4["rejection_reason"] == "no_free_order"
        assert md4["rejection_reason"] == "no_free_order"
    finally:
        pulpo_runtime.test_mode = prev
