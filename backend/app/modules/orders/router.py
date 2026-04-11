from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_role, Role
from app.modules.orders import service
from app.modules.orders.schemas import (
    OrderStateRead,
    OrderStateListItem,
    OrderResolveRequest,
    OrderDeleteRequest,
    OrderFilterParams,
)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderStateListItem])
async def list_orders(
    state: str | None = None,
    machine_id: str | None = None,
    barcode: str | None = None,
    reference_id: str | None = None,
    carrier: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    filters = OrderFilterParams(
        state=state,
        machine_id=machine_id,
        barcode=barcode,
        reference_id=reference_id,
        carrier=carrier,
        limit=limit,
        offset=offset,
    )
    return await service.list_orders(db, user["tenant_id"], filters)


@router.get("/active", response_model=list[OrderStateRead])
async def get_active_orders(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    """Get all currently active orders on a machine conveyor (live monitor)."""
    return await service.get_active_orders_for_machine(db, machine_id)


@router.get("/{order_id}", response_model=OrderStateRead)
async def get_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    order = await service.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.post("/{order_id}/resolve", response_model=OrderStateRead)
async def resolve_order(
    order_id: str,
    data: OrderResolveRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(Role.OPERATOR)),
):
    """Manually resolve an EJECTED or FAILED order."""
    return await service.resolve_order(db, order_id, user["sub"], data)


@router.post("/{order_id}/delete", response_model=OrderStateRead)
async def delete_order(
    order_id: str,
    data: OrderDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    """Soft-delete an order state (admin action)."""
    return await service.soft_delete_order(db, order_id, user["sub"], data.reason)
