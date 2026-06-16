"""Single-Order-Mehrfach-Barcode: derselbe Artikel-Barcode steht N-fach in der
CW-Liste (N Aufträge, N Empfänger). Jeder Scan (reference_id) muss an EINEN
eigenen, noch freien Pulpo-Auftrag gebunden werden — nie an einen fremden oder
veralteten. Test gegen In-Memory-SQLite."""

from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base

from app.modules.auth import models as _auth  # noqa: F401
from app.modules.tenants import models as _tenants  # noqa: F401
from app.modules.machines import models as _machines  # noqa: F401
from app.modules.orders import models as _orders  # noqa: F401
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder

from app.gateway.connection import ConnectionManager

TENANT = "t1"
EAN = "4005240040058"


def _fresh_db():
    engine = create_async_engine("sqlite+aiosqlite://")
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(init())
    return sm


async def _seed_two_single_orders(db):
    """Zwei Single-Orders mit GLEICHEM Artikel-EAN, aber verschiedenen
    Empfängern."""
    for oid, name, city in (("PO-A", "Erika Mustermann", "Berlin"),
                            ("PO-B", "Leonard Fink", "Aschaffenburg")):
        o = PulpoPackingOrder(
            tenant_id=TENANT, pulpo_order_id=oid, state="queue",
            cart_box_barcode="",
            raw_payload={"sales_order": {"ship_to": {"name": name, "address": {"city": city}}}},
        )
        o.items = [PulpoOrderItem(ean=EAN, quantity=1)]
        db.add(o)
    await db.commit()


def test_same_barcode_claims_distinct_orders():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed_two_single_orders(db)
            o1 = await cm._claim_pulpo_order(db, "0001", TENANT, "ref-1", EAN)
            o2 = await cm._claim_pulpo_order(db, "0001", TENANT, "ref-2", EAN)
            assert o1 is not None and o2 is not None
            # Zwei verschiedene Scans → zwei VERSCHIEDENE Aufträge.
            assert o1.pulpo_order_id != o2.pulpo_order_id

            # Erneuter Claim derselben ref ist stabil (gleicher Auftrag).
            o1b = await cm._claim_pulpo_order(db, "0001", TENANT, "ref-1", EAN)
            assert o1b.pulpo_order_id == o1.pulpo_order_id

    asyncio.run(run())


def test_release_frees_order_for_next_scan():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed_two_single_orders(db)
            o1 = await cm._claim_pulpo_order(db, "0001", TENANT, "ref-1", EAN)
            # ref-1 wird ausgeworfen → Bindung frei.
            cm.release_cw_for_ref("0001", "ref-1")
            # Neuer Scan darf nun denselben Auftrag wieder bekommen.
            o3 = await cm._claim_pulpo_order(db, "0001", TENANT, "ref-3", EAN)
            assert o3 is not None
            assert o3.pulpo_order_id in {"PO-A", "PO-B"}

    asyncio.run(run())


def test_no_candidate_returns_none():
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed_two_single_orders(db)
            assert await cm._claim_pulpo_order(db, "0001", TENANT, "ref-x", "DOES-NOT-EXIST") is None

    asyncio.run(run())


def test_empty_barcode_never_matches_an_order():
    """Leerer Barcode (z.B. Tracker-Miss bei LAB1/IND) darf NIE eine Order
    treffen — cart_box_barcode=='' würde sonst die älteste fremde Single-Order
    liefern (der „Leonard"-Bug: immer dieselbe falsche Adresse aufs Label)."""
    sm = _fresh_db()
    cm = ConnectionManager()

    async def run():
        async with sm() as db:
            await _seed_two_single_orders(db)  # beide mit cart_box_barcode=""
            assert await cm._claim_pulpo_order(db, "0001", TENANT, "ref-x", "") is None
            assert await cm._try_pulpo_label(db, TENANT, "") is None
            assert await cm._resolve_pulpo_recipient(db, TENANT, "") is None

    asyncio.run(run())


def test_tracker_keyed_by_protocol_id_roundtrip():
    """apply() und get_package() müssen denselben Schlüssel verwenden —
    sonst ist der Barcode bei LAB1 leer (Ursache des Leonard-Bugs)."""
    cm = ConnectionManager()
    cm._tracker.apply("SIM-DEMO", "ENQ", {"barcode": "DEMO-X1", "event": "7"}, "ref-7")
    pkg = cm._tracker.get_package("SIM-DEMO", "ref-7")
    assert pkg is not None and pkg["barcode"] == "DEMO-X1"


def test_extract_ship_to_from_pulpo_shapes():
    """Empfänger (Pulpo „Detail → Adresse") muss aus allen relevanten Formen
    gezogen werden: direkt, unter sales_order, oder selbst eine Adresse."""
    from app.gateway.connection import _extract_ship_to, _ship_to_usable

    ship_to = {
        "name": "Anselm Schöpf", "phone_number": "015209989152",
        "address": {"street": "Mergentheimer Straße", "house_nr": "26",
                    "zip": "97082", "city": "Würzburg", "country": "Germany",
                    "email": "x@marketplace.amazon.de"},
    }
    # a) Verkaufsauftrag mit ship_to
    so = {"id": 1, "order_num": "302-8456295", "ship_to": ship_to}
    assert _extract_ship_to(so)["name"] == "Anselm Schöpf"
    # b) Packauftrag, der den Verkaufsauftrag einbettet
    po = {"id": 2, "sequence_number": "PA-0591431", "sales_order": so}
    assert _extract_ship_to(po)["name"] == "Anselm Schöpf"
    # c) Objekt ist selbst eine Adresse
    assert _extract_ship_to(ship_to)["name"] == "Anselm Schöpf"
    # d) Queue-Order ohne Adresse (nur sales_order_id) → None
    assert _extract_ship_to({"id": 3, "sales_order_id": 70635709}) is None
    assert _ship_to_usable(ship_to) is True
    assert _ship_to_usable({"address": {"zip": "1"}}) is False  # keine Straße
