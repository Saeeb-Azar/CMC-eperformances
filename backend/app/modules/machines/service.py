from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.modules.machines.models import Machine, HeartbeatLog
from app.modules.machines.schemas import MachineCreate, MachineUpdate


async def create_machine(db: AsyncSession, tenant_id: str, data: MachineCreate) -> Machine:
    machine = Machine(tenant_id=tenant_id, **data.model_dump())
    db.add(machine)
    await db.flush()
    return machine


async def get_machine(db: AsyncSession, machine_db_id: str) -> Machine | None:
    return await db.get(Machine, machine_db_id)


async def get_machine_by_machine_id(db: AsyncSession, tenant_id: str, machine_id: str) -> Machine | None:
    result = await db.execute(
        select(Machine).where(Machine.tenant_id == tenant_id, Machine.machine_id == machine_id)
    )
    return result.scalar_one_or_none()


async def list_machines(db: AsyncSession, tenant_id: str) -> list[Machine]:
    result = await db.execute(
        select(Machine).where(Machine.tenant_id == tenant_id).order_by(Machine.created_at.desc())
    )
    return list(result.scalars().all())


async def update_machine(db: AsyncSession, machine_db_id: str, data: MachineUpdate) -> Machine | None:
    machine = await get_machine(db, machine_db_id)
    if not machine:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(machine, key, value)
    await db.flush()
    return machine


async def record_heartbeat(
    db: AsyncSession,
    machine_db_id: str,
    status: str,
    is_online: bool,
    response_time_ms: int | None = None,
) -> HeartbeatLog:
    """Record a heartbeat and update machine status."""
    machine = await get_machine(db, machine_db_id)
    if machine:
        machine.status = status
        machine.is_online = is_online
        machine.last_heartbeat_at = datetime.now(timezone.utc)

    log = HeartbeatLog(
        machine_db_id=machine_db_id,
        status=status,
        is_online=is_online,
        response_time_ms=response_time_ms,
    )
    db.add(log)
    await db.flush()
    return log


async def get_uptime_24h(db: AsyncSession, machine_db_id: str) -> dict:
    """Calculate uptime percentage over the last 24 hours from heartbeat logs."""
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    total_result = await db.execute(
        select(func.count(HeartbeatLog.id)).where(
            HeartbeatLog.machine_db_id == machine_db_id,
            HeartbeatLog.timestamp >= since,
        )
    )
    total = total_result.scalar() or 0

    online_result = await db.execute(
        select(func.count(HeartbeatLog.id)).where(
            HeartbeatLog.machine_db_id == machine_db_id,
            HeartbeatLog.timestamp >= since,
            HeartbeatLog.is_online == True,
        )
    )
    online = online_result.scalar() or 0

    return {
        "total_heartbeats_24h": total,
        "uptime_percent_24h": round((online / total * 100), 2) if total > 0 else None,
    }


async def increment_sequence(db: AsyncSession, machine_db_id: str) -> int:
    """Increment and return the ENQ sequence number for a machine."""
    machine = await get_machine(db, machine_db_id)
    if not machine:
        raise ValueError("Machine not found")
    machine.enq_sequence += 1
    machine.last_event_at = datetime.now(timezone.utc)
    await db.flush()
    return machine.enq_sequence
