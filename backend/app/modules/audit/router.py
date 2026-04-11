from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.core.database import get_db
from app.core.permissions import get_current_user, require_role, Role
from app.modules.audit import service
from app.modules.audit.schemas import AuditLogRead, AuditFilterParams

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogRead])
async def list_audit_logs(
    category: str | None = None,
    event_type: str | None = None,
    machine_id: str | None = None,
    reference_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(Role.VIEWER)),
):
    filters = AuditFilterParams(
        category=category,
        event_type=event_type,
        machine_id=machine_id,
        reference_id=reference_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return await service.list_audit_logs(db, user["tenant_id"], filters)
