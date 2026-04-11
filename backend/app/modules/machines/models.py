import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Machine(Base):
    """
    A CMC CartonWrap machine instance.
    Each tenant can have multiple machines.
    Tracks config, connection state, and health.
    """

    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    machine_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # e.g. "0001" from simulator
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="CW1000")  # CW1000, CW XL, etc.

    # Connection config (from simulator)
    tcp_role: Mapped[str] = mapped_column(String(10), default="server")  # "server" or "client"
    tcp_host: Mapped[str] = mapped_column(String(255), default="127.0.0.1")
    tcp_port: Mapped[int] = mapped_column(Integer, default=15001)

    # Machine capabilities (from simulator flags)
    lab1_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    lab2_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    inv_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    pre_create_labels: Mapped[bool] = mapped_column(Boolean, default=True)

    # Dimension limits (for ACK validation)
    max_length_mm: Mapped[int] = mapped_column(Integer, default=6000)
    max_width_mm: Mapped[int] = mapped_column(Integer, default=4000)
    max_height_mm: Mapped[int] = mapped_column(Integer, default=3000)

    # Current state
    status: Mapped[str] = mapped_column(String(20), default="STOP")  # STOP, RUNNING, PAUSE, ERROR
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Sequence tracking (monotonically increasing)
    enq_sequence: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="machines")
    heartbeat_logs: Mapped[list["HeartbeatLog"]] = relationship(back_populates="machine")


class HeartbeatLog(Base):
    """Tracks every heartbeat for uptime/downtime analysis."""

    __tablename__ = "heartbeat_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    machine_db_id: Mapped[str] = mapped_column(String(36), ForeignKey("machines.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # STOP, RUNNING, PAUSE, ERROR
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False)
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    machine: Mapped["Machine"] = relationship(back_populates="heartbeat_logs")
