from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_role, Role
from app.modules.machines import service
from app.modules.machines.schemas import (
    MachineCreate,
    MachineRead,
    MachineUpdate,
    MachineStatusRead,
)

router = APIRouter(prefix="/machines", tags=["machines"])


@router.post("", response_model=MachineRead)
async def create_machine(
    data: MachineCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    return await service.create_machine(db, user["tenant_id"], data)


@router.get("", response_model=list[MachineRead])
async def list_machines(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await service.list_machines(db, user["tenant_id"])


@router.get("/{machine_id}", response_model=MachineRead)
async def get_machine(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    machine = await service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")
    return machine


@router.patch("/{machine_id}", response_model=MachineRead)
async def update_machine(
    machine_id: str,
    data: MachineUpdate,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    machine = await service.update_machine(db, machine_id, data)
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")
    return machine


@router.get("/{machine_id}/status", response_model=MachineStatusRead)
async def get_machine_status(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    machine = await service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")

    uptime = await service.get_uptime_24h(db, machine_id)
    return MachineStatusRead(
        machine_id=machine.machine_id,
        status=machine.status,
        is_online=machine.is_online,
        last_heartbeat_at=machine.last_heartbeat_at,
        **uptime,
    )
