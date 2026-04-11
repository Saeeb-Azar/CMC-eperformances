"""
Audit Log: Every event, state transition, and user action is recorded.
Full traceability for compliance and debugging.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Text, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # What happened
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Categories: machine_event, state_transition, user_action, api_call, error
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # Who/what triggered it
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)  # machine, user, system
    actor_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # user_id or machine_id

    # Context
    machine_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # State change tracking
    previous_state: Mapped[str | None] = mapped_column(String(20), nullable=True)
    new_state: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Payload & details (JSON)
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Response time for performance tracking
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # IP & user agent for security
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    __table_args__ = (
        Index("ix_audit_tenant_timestamp", "tenant_id", "timestamp"),
        Index("ix_audit_category_event", "category", "event_type"),
    )
