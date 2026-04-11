from pydantic import BaseModel
from datetime import datetime


class AuditLogCreate(BaseModel):
    event_type: str
    category: str
    actor_type: str
    actor_id: str | None = None
    machine_id: str | None = None
    reference_id: str | None = None
    order_id: str | None = None
    previous_state: str | None = None
    new_state: str | None = None
    payload: str | None = None
    detail: str | None = None
    response_time_ms: int | None = None
    ip_address: str | None = None


class AuditLogRead(BaseModel):
    id: str
    tenant_id: str
    event_type: str
    category: str
    actor_type: str
    actor_id: str | None
    machine_id: str | None
    reference_id: str | None
    order_id: str | None
    previous_state: str | None
    new_state: str | None
    detail: str | None
    response_time_ms: int | None
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditFilterParams(BaseModel):
    category: str | None = None
    event_type: str | None = None
    machine_id: str | None = None
    reference_id: str | None = None
    actor_id: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = 100
    offset: int = 0
