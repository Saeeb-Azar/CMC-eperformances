"""Akzeptanztests für die Auftragsbindung (Fix-Brief „Versetzte Label").

Deckt ab:
  1. Happy Path, gleiche EANs: 3 Aufträge A,B,C → Labels/Bindung in Scan-Reihenfolge.
  3. Überzahl: mehr Scans als Aufträge → letzter wird abgelehnt (kein freier Auftrag).
  5. FAILED-Guard: ein FAILED-Auftrag bleibt reserviert → kein Doppel-Griff.
  7. Unit _claim_pulpo_order: deterministische 1:1-Zuordnung; N+1 → None.

Plus DRY-RUN (read-only, rollback-only):
  - 3 gleiche EANs → A,B,C in Scan-Reihenfolge.
  - Überzahl → letzter REJECT.
  - Nachweis: nach dem Dry-Run KEIN OrderState in der DB persistiert.

In-Memory-SQLite, keine echten Pulpo-/DHL-Calls (ship_to liegt lokal im
raw_payload → _resolve_pulpo_recipient ruft nichts Externes).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base

from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants.models import Tenant
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder

from app.gateway.connection import ConnectionManager

TENANT = "t1"
PROTO = "0001"
EAN = "4005240040555"


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(init())
    return sm


def _ship_to(name, city):
    return {"name": name, "phone_number": "030 1",
            "address": {"street": "Teststr", "house_nr": "1", "zip": "10115",
                        "city": city, "country": "DEU", "email": "x@y.z"}}


async def _seed(db, n=3):
    db.add(Tenant(id=TENANT, name="T", slug="t"))
    db.add(Machine(id="m1", tenant_id=TENANT, machine_id=PROTO, name="CW", enq_sequence=0))
    base = datetime(2026, 6, 1, tzinfo=timezone.utc)
    labels = ["A", "B", "C", "D", "E"][:n]
    for k, lab in enumerate(labels):
        o = PulpoPackingOrder(
            tenant_id=TENANT, pulpo_order_id=f"PA-{lab}", state="queue",
            cart_box_barcode="", created_at=base + timedelta(minutes=k),
            raw_payload={"sequence_number": f"PA-{lab}", "sales_order_id": 100 + k,
                         "sales_order": {"order_num": f"SO-{lab}", "ship_to": _ship_to(f"Kunde {lab}", lab)}},
        )
        o.items = [PulpoOrderItem(ean=EAN, quantity=1, product_name=f"Artikel {lab}")]
        db.add(o)
    await db.commit()


# ── §8.1 / §8.7 — claim+bind in Scan-Reihenfolge, N+1 → None ──────────────
def test_claim_bind_fifo_same_ean_then_none():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed(db, n=3)
            got = []
            for i in range(3):
                ref = f"ref{i+1:04d}"
                claimed = await cm._claim_pulpo_order(db, PROTO, TENANT, ref, EAN)
                assert claimed is not None, f"Scan {i+1} sollte einen Auftrag bekommen"
                await cm._bind_order_state(db, PROTO, ref, EAN, claimed)
                await db.flush()  # nächster Scan sieht die Reservierung
                got.append(claimed.pulpo_order_id)
            assert got == ["PA-A", "PA-B", "PA-C"], got   # FIFO nach created_at
            # 4. Scan: alle Kandidaten reserviert → None
            assert await cm._claim_pulpo_order(db, PROTO, TENANT, "ref0004", EAN) is None

    asyncio.run(run())


# ── §8.3 — Überzahl: 2 Aufträge, 3 Scans → letzter None ───────────────────
def test_overcount_last_rejected():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed(db, n=2)
            for i in range(2):
                ref = f"ref{i+1:04d}"
                c = await cm._claim_pulpo_order(db, PROTO, TENANT, ref, EAN)
                assert c is not None
                await cm._bind_order_state(db, PROTO, ref, EAN, c)
                await db.flush()
            assert await cm._claim_pulpo_order(db, PROTO, TENANT, "ref0003", EAN) is None

    asyncio.run(run())


# ── §8.5 — FAILED-Guard: FAILED-Auftrag bleibt reserviert ─────────────────
def test_failed_order_stays_reserved():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed(db, n=1)  # nur PA-A
            ref1 = "ref0001"
            c = await cm._claim_pulpo_order(db, PROTO, TENANT, ref1, EAN)
            assert c.pulpo_order_id == "PA-A"
            os_row = await cm._bind_order_state(db, PROTO, ref1, EAN, c)
            os_row.state = "FAILED"   # gelabelt, aber Pulpo-Abschluss schlug fehl
            await db.flush()
            # neuer Scan desselben EAN darf den FAILED-Auftrag NICHT erneut greifen
            assert await cm._claim_pulpo_order(db, PROTO, TENANT, "ref0002", EAN) is None

    asyncio.run(run())


# ── §8.6 — nach Eject (State DELETED) ist der Auftrag wieder frei ─────────
def test_ejected_order_is_free_again():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed(db, n=1)
            c = await cm._claim_pulpo_order(db, PROTO, TENANT, "ref0001", EAN)
            os_row = await cm._bind_order_state(db, PROTO, "ref0001", EAN, c)
            os_row.state = "DELETED"   # zu groß / ausgeworfen → zurück in die Queue
            cm._ref_pulpo_order.get(PROTO, {}).pop("ref0001", None)  # in-memory Freigabe
            await db.flush()
            again = await cm._claim_pulpo_order(db, PROTO, TENANT, "ref0002", EAN)
            assert again is not None and again.pulpo_order_id == "PA-A"

    asyncio.run(run())


# ── DRY-RUN: A,B,C in Scan-Reihenfolge, Überzahl REJECT, nichts persistiert ─
def test_dry_run_fifo_and_no_persistence():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed(db, n=3)

        # 4 Scans, nur 3 Aufträge → A,B,C dann REJECT
        results = await cm.dry_run_scan(PROTO, None, [EAN, EAN, EAN, EAN], session_factory=sm)
        oks = [r for r in results if r["status"] == "OK"]
        assert [r["packing_order"] for r in oks] == ["PA-A", "PA-B", "PA-C"], results
        assert [r["recipient"]["name"] for r in oks] == ["Kunde A", "Kunde B", "Kunde C"]
        assert results[-1]["status"] == "REJECT"
        # Label-Vorschau vorhanden, Tracking DRYRUN-…
        assert oks[0]["tracking"].startswith("DRYRUN-")
        assert oks[0]["label_preview_b64"]

        # NICHTS persistiert: keine OrderStates, keine CW-Abbuchung
        async with sm() as db:
            n_states = (await db.execute(select(func.count()).select_from(OrderState))).scalar_one()
            assert n_states == 0, f"Dry-Run hat {n_states} OrderState(s) hinterlassen!"

    asyncio.run(run())


if __name__ == "__main__":  # pragma: no cover
    test_claim_bind_fifo_same_ean_then_none()
    test_overcount_last_rejected()
    test_failed_order_stays_reserved()
    test_ejected_order_is_free_again()
    test_dry_run_fifo_and_no_persistence()
    print("OK")
