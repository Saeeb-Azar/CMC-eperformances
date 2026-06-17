"""Deferred-Write-Replay nach Pulpo (cmc-process-doc §5 / Fix-Brief).

Pulpo wird gemockt (kein Netz). Deckt ab:
  - END status=1 → alle 5 Calls in korrekter Reihenfolge → COMPLETED/DONE.
  - Test-Modus (write_enabled=False) → NULL Pulpo-Writes (simuliert).
  - Fehler in Schritt 4 (finish) → FAILED, deferred Payload bleibt erhalten.
  - Retry eines FAILED mit vorhandenem Tracking → KEIN attach_label → COMPLETED.
  - Idempotenz: vorhandener tracking_code → Label-Schritt übersprungen.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.dhl.models import Shipment
from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder
from app.modules.pulpo import replay as replay_mod
from app.modules.pulpo.runtime import pulpo_runtime

TENANT = "t1"
POID = "PO-123"


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(init())
    return sm


class FakePulpo:
    def __init__(self):
        self.calls: list[str] = []
        self.fail_on: str | None = None
        self.existing_trackings: list[dict] = []

    def _maybe_fail(self, step):
        if self.fail_on == step:
            raise Exception(f"boom@{step}")

    async def accept_packing_order(self, oid):
        self.calls.append("accept"); self._maybe_fail("accept")

    async def create_box(self, oid, **kw):
        self.calls.append("create_box"); self._maybe_fail("create_box"); return {"id": "BOX1"}

    async def update_box(self, oid, box_id, **kw):
        self.calls.append("update_box"); self._maybe_fail("update_box")

    async def list_box_shipment_trackings(self, oid, box_id):
        self.calls.append("list_tracking"); return list(self.existing_trackings)

    async def attach_label(self, oid, box_id, **kw):
        self.calls.append("attach_label"); self._maybe_fail("attach_label")

    async def finish_packing_order(self, oid):
        self.calls.append("finish"); self._maybe_fail("finish")

    async def close_packing_order(self, oid, loc):
        self.calls.append("close"); self._maybe_fail("close")

    async def list_shipping_locations(self, oid):
        self.calls.append("ship_loc"); return [{"id": "LOC1"}]


async def _seed(db):
    db.add(Tenant(id=TENANT, name="T", slug="t"))
    db.add(Machine(id="m1", tenant_id=TENANT, machine_id="0001", name="CW", enq_sequence=1))
    po = PulpoPackingOrder(tenant_id=TENANT, pulpo_order_id=POID, state="queue",
                           raw_payload={"sequence_number": "PA-1"})
    po.items = [PulpoOrderItem(ean="4005", quantity=1, product_id="PROD-9", product_name="Artikel")]
    db.add(po)
    db.add(Shipment(tenant_id=TENANT, reference_id="ref0001", barcode="4005",
                    tracking_number="00340TRACK", carrier="DHL", label_b64="QkFTRTY0",
                    label_format="PDF"))
    o = OrderState(
        tenant_id=TENANT, machine_db_id="m1", reference_id="ref0001", barcode="4005",
        state="COMPLETED", enq_sequence=1, pulpo_order_id=POID,
        final_length_mm=200, final_width_mm=150, final_height_mm=80, final_weight_g=500,
        tracking_number="00340TRACK", carrier="DHL", pulpo_replay_state="NONE",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(o)
    await db.commit()
    return o


def _run(coro):
    return asyncio.run(coro)


def _with_fake(fake):
    """Pulpo-Singleton in replay durch Fake ersetzen (Setup/Teardown)."""
    real = replay_mod.pulpo
    replay_mod.pulpo = fake
    return real


# ── END status=1 → 5 Calls in Reihenfolge → COMPLETED ─────────────────────
def test_replay_full_sequence_in_order():
    sm = _fresh_db(); fake = FakePulpo()
    real = _with_fake(fake); prev = pulpo_runtime.write_enabled
    pulpo_runtime.write_enabled = True

    async def run():
        async with sm() as db:
            o = await _seed(db)
            res = await replay_mod.replay_to_pulpo(db, o)
            assert res["ok"], res
            assert o.pulpo_replay_state == "DONE"
            assert o.state == "COMPLETED"
            # Reihenfolge (Tracking-Lookup vor attach):
            assert fake.calls == [
                "accept", "create_box", "update_box", "list_tracking",
                "attach_label", "finish", "ship_loc", "close",
            ], fake.calls
    try:
        _run(run())
    finally:
        replay_mod.pulpo = real; pulpo_runtime.write_enabled = prev


# ── Test-Modus → NULL echte Writes (simuliert) ────────────────────────────
def test_replay_simulated_in_test_mode():
    sm = _fresh_db(); fake = FakePulpo()
    real = _with_fake(fake); prev = pulpo_runtime.write_enabled
    pulpo_runtime.write_enabled = False  # Test-Modus

    async def run():
        async with sm() as db:
            o = await _seed(db)
            res = await replay_mod.replay_to_pulpo(db, o)
            assert res["ok"] and res["simulated"] is True
            assert o.pulpo_replay_state == "DONE"
            assert fake.calls == [], f"Im Test-Modus darf KEIN Pulpo-Call passieren: {fake.calls}"
    try:
        _run(run())
    finally:
        replay_mod.pulpo = real; pulpo_runtime.write_enabled = prev


# ── Fehler in Schritt 4 (finish) → FAILED, Payload bleibt ─────────────────
def test_replay_failure_keeps_payload():
    sm = _fresh_db(); fake = FakePulpo(); fake.fail_on = "finish"
    real = _with_fake(fake); prev = pulpo_runtime.write_enabled
    pulpo_runtime.write_enabled = True

    async def run():
        async with sm() as db:
            o = await _seed(db)
            res = await replay_mod.replay_to_pulpo(db, o)
            assert not res["ok"]
            assert o.pulpo_replay_state == "FAILED"
            assert o.state == "FAILED"
            assert o.pulpo_replay_error and "finish" in o.pulpo_replay_error
            # deferred Payload erhalten (Maße/Tracking stehen noch):
            assert o.final_length_mm == 200 and o.tracking_number == "00340TRACK"
            assert "close" not in fake.calls
    try:
        _run(run())
    finally:
        replay_mod.pulpo = real; pulpo_runtime.write_enabled = prev


# ── Retry eines FAILED mit vorhandenem Tracking → kein attach_label ───────
def test_retry_skips_carrier_call_when_tracking_exists():
    sm = _fresh_db()
    fake = FakePulpo(); fake.existing_trackings = [{"tracking_code": "00340TRACK"}]
    real = _with_fake(fake); prev = pulpo_runtime.write_enabled
    pulpo_runtime.write_enabled = True

    async def run():
        async with sm() as db:
            o = await _seed(db)
            o.pulpo_replay_state = "FAILED"; o.pulpo_box_id = "BOX1"
            await db.commit()
            res = await replay_mod.replay_to_pulpo(db, o, is_retry=True)
            assert res["ok"]
            assert o.pulpo_replay_state == "DONE" and o.state == "COMPLETED"
            # KEIN zweiter Carrier-Call, KEIN create_box (box_id schon da):
            assert "attach_label" not in fake.calls, fake.calls
            assert "create_box" not in fake.calls, fake.calls
            assert "finish" in fake.calls and "close" in fake.calls
    try:
        _run(run())
    finally:
        replay_mod.pulpo = real; pulpo_runtime.write_enabled = prev


if __name__ == "__main__":  # pragma: no cover
    test_replay_full_sequence_in_order()
    test_replay_simulated_in_test_mode()
    test_replay_failure_keeps_payload()
    test_retry_skips_carrier_call_when_tracking_exists()
    print("OK")
