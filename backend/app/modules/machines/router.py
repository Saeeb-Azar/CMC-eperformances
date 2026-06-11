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
    # Die Maschinen-ID ist der Verknüpfungsschlüssel zur TCP-Verbindung —
    # zwei Maschinen mit derselben ID machen die Zuordnung mehrdeutig
    # (Name/Heartbeat springen zwischen den Einträgen hin und her).
    existing = await service.get_machine_by_machine_id(db, user["tenant_id"], data.machine_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Maschinen-ID „{data.machine_id}“ ist bereits durch "
                f"„{existing.name}“ belegt. Jede ID kann nur EINER Maschine "
                f"zugeordnet werden — bitte die bestehende Maschine bearbeiten "
                f"oder eine andere ID verwenden."
            ),
        )
    return await service.create_machine(db, user["tenant_id"], data)


@router.delete("/{machine_id}")
async def delete_machine(
    machine_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    ok = await service.delete_machine(db, machine_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found")
    return {"ok": True}


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
    machine.is_online = service.effective_online(machine)
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
    # Stationsflags-Cache der aktiven TCP-Verbindung invalidieren, damit ein
    # frisch gesetztes LAB1-Häkchen sofort beim nächsten ENQ greift (sonst
    # sendet die Connection noch ewig die alten gecachten Flags weiter).
    try:
        from app.gateway.connection import connection_manager
        connection_manager.invalidate_station_flags(machine.machine_id)
    except Exception:
        pass  # Best-effort — Cache kommt beim nächsten Reconnect ohnehin neu
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
    online = service.effective_online(machine)
    return MachineStatusRead(
        machine_id=machine.machine_id,
        # Eine Maschine ohne frischen Heartbeat darf nie "running" melden.
        status=machine.status if online else "offline",
        is_online=online,
        last_heartbeat_at=machine.last_heartbeat_at,
        **uptime,
    )
