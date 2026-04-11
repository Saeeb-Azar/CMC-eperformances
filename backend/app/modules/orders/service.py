"""
Order state management.

Implements the complete state lifecycle:
ASSIGNED → INDUCTED → SCANNED → LABELED → COMPLETED / FAILED / EJECTED / DELETED

Includes reservation guard, sequence-based ejection, and manual resolution.
"""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.core.exceptions import InvalidStateTransition, OrderNotFound
from app.modules.orders.models import OrderState
from app.modules.orders.schemas import OrderFilterParams, OrderResolveRequest

# Valid state transitions
ACTIVE_STATES = {"ASSIGNED", "INDUCTED", "SCANNED", "LABELED"}
TERMINAL_STATES = {"COMPLETED", "FAILED", "EJECTED", "DELETED"}
RESERVATION_GUARD_STATES = ACTIVE_STATES | {"FAILED"}

VALID_TRANSITIONS = {
    "ASSIGNED": {"INDUCTED", "EJECTED", "DELETED"},
    "INDUCTED": {"SCANNED", "EJECTED", "DELETED"},
    "SCANNED": {"LABELED", "EJECTED", "DELETED"},
    "LABELED": {"COMPLETED", "FAILED", "EJECTED", "DELETED"},
    "EJECTED": {"COMPLETED", "FAILED", "DELETED"},
    "FAILED": {"COMPLETED", "DELETED"},
}


async def create_order_state(
    db: AsyncSession,
    tenant_id: str,
    machine_db_id: str,
    reference_id: str,
    barcode: str,
    enq_sequence: int,
    **kwargs,
) -> OrderState:
    order = OrderState(
        tenant_id=tenant_id,
        machine_db_id=machine_db_id,
        reference_id=reference_id,
        barcode=barcode,
        enq_sequence=enq_sequence,
        state="ASSIGNED",
        enq_at=datetime.now(timezone.utc),
        **kwargs,
    )
    db.add(order)
    await db.flush()
    return order


async def get_order(db: AsyncSession, order_id: str) -> OrderState | None:
    return await db.get(OrderState, order_id)


async def get_order_by_reference(db: AsyncSession, reference_id: str) -> OrderState | None:
    result = await db.execute(
        select(OrderState).where(OrderState.reference_id == reference_id)
    )
    return result.scalar_one_or_none()


async def list_orders(db: AsyncSession, tenant_id: str, filters: OrderFilterParams) -> list[OrderState]:
    query = select(OrderState).where(OrderState.tenant_id == tenant_id)

    if filters.state:
        query = query.where(OrderState.state == filters.state)
    if filters.machine_id:
        query = query.where(OrderState.machine_db_id == filters.machine_id)
    if filters.barcode:
        query = query.where(OrderState.barcode.ilike(f"%{filters.barcode}%"))
    if filters.reference_id:
        query = query.where(OrderState.reference_id.ilike(f"%{filters.reference_id}%"))
    if filters.carrier:
        query = query.where(OrderState.carrier == filters.carrier)
    if filters.date_from:
        query = query.where(OrderState.created_at >= filters.date_from)
    if filters.date_to:
        query = query.where(OrderState.created_at <= filters.date_to)

    query = query.order_by(OrderState.created_at.desc()).offset(filters.offset).limit(filters.limit)
    result = await db.execute(query)
    return list(result.scalars().all())


async def transition_state(db: AsyncSession, order_id: str, new_state: str, **extra_fields) -> OrderState:
    """Transition an order to a new state with validation."""
    order = await get_order(db, order_id)
    if not order:
        raise OrderNotFound(order_id)

    if new_state not in VALID_TRANSITIONS.get(order.state, set()):
        raise InvalidStateTransition(order.state, new_state)

    order.state = new_state
    for key, value in extra_fields.items():
        if hasattr(order, key):
            setattr(order, key, value)

    if new_state == "COMPLETED":
        order.completed_at = datetime.now(timezone.utc)

    await db.flush()
    return order


async def check_reservation(db: AsyncSession, tenant_id: str, barcode: str) -> list[OrderState]:
    """Check if any active or FAILED states exist for this barcode (reservation guard)."""
    result = await db.execute(
        select(OrderState).where(
            OrderState.tenant_id == tenant_id,
            OrderState.barcode == barcode,
            OrderState.state.in_(RESERVATION_GUARD_STATES),
        )
    )
    return list(result.scalars().all())


async def eject_older_states(db: AsyncSession, machine_db_id: str, current_sequence: int) -> list[OrderState]:
    """Sequence-based ejection: eject all active states older than current sequence."""
    result = await db.execute(
        select(OrderState).where(
            OrderState.machine_db_id == machine_db_id,
            OrderState.state.in_(ACTIVE_STATES),
            OrderState.enq_sequence < current_sequence,
        )
    )
    older_orders = list(result.scalars().all())

    for order in older_orders:
        order.state = "EJECTED"
        order.ejection_reason = "skipped_by_subsequent_end"

    await db.flush()
    return older_orders


async def resolve_order(
    db: AsyncSession,
    order_id: str,
    user_id: str,
    data: OrderResolveRequest,
) -> OrderState:
    """Manually resolve an EJECTED or FAILED order."""
    order = await get_order(db, order_id)
    if not order:
        raise OrderNotFound(order_id)

    if order.state not in {"EJECTED", "FAILED"}:
        raise InvalidStateTransition(order.state, "COMPLETED")

    order.state = "COMPLETED"
    order.resolved_by = user_id
    order.resolved_at = datetime.now(timezone.utc)
    order.resolution_reason = data.resolution_reason
    order.failure_resolved = True
    order.completed_at = datetime.now(timezone.utc)

    if data.tracking_number:
        order.tracking_number = data.tracking_number
    if data.tracking_url:
        order.tracking_url = data.tracking_url

    await db.flush()
    return order


async def soft_delete_order(db: AsyncSession, order_id: str, user_id: str, reason: str) -> OrderState:
    """Soft-delete an order state via Dashboard."""
    order = await get_order(db, order_id)
    if not order:
        raise OrderNotFound(order_id)

    order.previous_state_before_delete = order.state
    order.state = "DELETED"
    order.deleted_by = user_id
    order.deleted_at = datetime.now(timezone.utc)
    order.resolution_reason = reason

    await db.flush()
    return order


async def delete_state_for_rem(db: AsyncSession, reference_id: str) -> OrderState | None:
    """Handle REM event: delete state so order returns to queue."""
    order = await get_order_by_reference(db, reference_id)
    if not order:
        return None

    order.state = "DELETED"
    order.rem_at = datetime.now(timezone.utc)
    order.ejection_reason = "operator_removed"
    await db.flush()
    return order


async def get_active_orders_for_machine(db: AsyncSession, machine_db_id: str) -> list[OrderState]:
    """Get all currently active orders on a machine (for live monitor)."""
    result = await db.execute(
        select(OrderState).where(
            OrderState.machine_db_id == machine_db_id,
            OrderState.state.in_(ACTIVE_STATES),
        ).order_by(OrderState.enq_sequence.asc())
    )
    return list(result.scalars().all())
