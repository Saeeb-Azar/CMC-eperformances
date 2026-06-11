"""Manueller Eject — Notausstieg für hängende Aufträge."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.exceptions import InvalidStateTransition, OrderNotFound
from app.modules.orders import service as orders_service
from app.modules.orders.models import OrderState


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with Session() as s:
        yield s


def _new_order(state: str = "ASSIGNED") -> OrderState:
    return OrderState(
        tenant_id="t", machine_db_id="m", reference_id="ref0001",
        barcode="4005240023440", state=state, enq_sequence=1,
    )


@pytest.mark.asyncio
async def test_manual_eject_active_order_marks_ejected(db: AsyncSession):
    o = _new_order(state="ASSIGNED")
    db.add(o); await db.flush()
    result = await orders_service.manual_eject_order(
        db, o.id, user_id="user1", reason="Paket entfernt",
    )
    assert result.state == "EJECTED"
    assert result.ejection_reason == "manual: Paket entfernt"
    assert result.resolved_by == "user1"
    assert result.resolved_at is not None


@pytest.mark.asyncio
async def test_manual_eject_works_from_any_active_state(db: AsyncSession):
    """ASSIGNED, INDUCTED, SCANNED, LABELED, FAILED, EJECTED → alle erlaubt."""
    for state in ("ASSIGNED", "INDUCTED", "SCANNED", "LABELED", "FAILED", "EJECTED"):
        o = _new_order(state=state); o.reference_id = f"ref-{state}"
        db.add(o); await db.flush()
        r = await orders_service.manual_eject_order(db, o.id, "u", "reason")
        assert r.state == "EJECTED", f"failed from {state}"


@pytest.mark.asyncio
async def test_manual_eject_rejects_completed(db: AsyncSession):
    o = _new_order(state="COMPLETED"); db.add(o); await db.flush()
    with pytest.raises(InvalidStateTransition):
        await orders_service.manual_eject_order(db, o.id, "u", "r")


@pytest.mark.asyncio
async def test_manual_eject_rejects_deleted(db: AsyncSession):
    o = _new_order(state="DELETED"); db.add(o); await db.flush()
    with pytest.raises(InvalidStateTransition):
        await orders_service.manual_eject_order(db, o.id, "u", "r")


@pytest.mark.asyncio
async def test_manual_eject_missing_order(db: AsyncSession):
    with pytest.raises(OrderNotFound):
        await orders_service.manual_eject_order(db, "does-not-exist", "u", "r")


@pytest.mark.asyncio
async def test_manual_eject_empty_reason_falls_back(db: AsyncSession):
    o = _new_order(); db.add(o); await db.flush()
    r = await orders_service.manual_eject_order(db, o.id, "u", "   ")
    assert r.ejection_reason == "manual"
