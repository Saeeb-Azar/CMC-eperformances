import json
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogCreate, AuditFilterParams


async def log_event(db: AsyncSession, tenant_id: str, data: AuditLogCreate) -> AuditLog:
    """Record an audit log entry."""
    entry = AuditLog(tenant_id=tenant_id, **data.model_dump())
    db.add(entry)
    await db.flush()
    return entry


async def log_machine_event(
    db: AsyncSession,
    tenant_id: str,
    event_type: str,
    machine_id: str,
    reference_id: str | None = None,
    order_id: str | None = None,
    payload: dict | None = None,
    detail: str | None = None,
    response_time_ms: int | None = None,
) -> AuditLog:
    """Convenience: log a machine protocol event (ENQ, IND, ACK, etc.)."""
    return await log_event(db, tenant_id, AuditLogCreate(
        event_type=event_type,
        category="machine_event",
        actor_type="machine",
        actor_id=machine_id,
        machine_id=machine_id,
        reference_id=reference_id,
        order_id=order_id,
        payload=json.dumps(payload) if payload else None,
        detail=detail,
        response_time_ms=response_time_ms,
    ))


async def log_state_transition(
    db: AsyncSession,
    tenant_id: str,
    order_id: str,
    reference_id: str,
    previous_state: str,
    new_state: str,
    machine_id: str | None = None,
    detail: str | None = None,
) -> AuditLog:
    """Log a state transition for full traceability."""
    return await log_event(db, tenant_id, AuditLogCreate(
        event_type="state_transition",
        category="state_transition",
        actor_type="system",
        machine_id=machine_id,
        reference_id=reference_id,
        order_id=order_id,
        previous_state=previous_state,
        new_state=new_state,
        detail=detail,
    ))


async def log_user_action(
    db: AsyncSession,
    tenant_id: str,
    user_id: str,
    action: str,
    order_id: str | None = None,
    reference_id: str | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Log a user action (resolve, delete, config change, etc.)."""
    return await log_event(db, tenant_id, AuditLogCreate(
        event_type=action,
        category="user_action",
        actor_type="user",
        actor_id=user_id,
        order_id=order_id,
        reference_id=reference_id,
        detail=detail,
        ip_address=ip_address,
    ))


async def list_audit_logs(
    db: AsyncSession, tenant_id: str, filters: AuditFilterParams
) -> list[AuditLog]:
    query = select(AuditLog).where(AuditLog.tenant_id == tenant_id)

    if filters.category:
        query = query.where(AuditLog.category == filters.category)
    if filters.event_type:
        query = query.where(AuditLog.event_type == filters.event_type)
    if filters.machine_id:
        query = query.where(AuditLog.machine_id == filters.machine_id)
    if filters.reference_id:
        query = query.where(AuditLog.reference_id == filters.reference_id)
    if filters.actor_id:
        query = query.where(AuditLog.actor_id == filters.actor_id)
    if filters.date_from:
        query = query.where(AuditLog.timestamp >= filters.date_from)
    if filters.date_to:
        query = query.where(AuditLog.timestamp <= filters.date_to)

    query = query.order_by(AuditLog.timestamp.desc()).offset(filters.offset).limit(filters.limit)
    result = await db.execute(query)
    return list(result.scalars().all())
