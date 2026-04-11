"""
CMC Order State Model

Tracks every package flowing through the machine with the full state lifecycle:
ASSIGNED → INDUCTED → SCANNED → LABELED → COMPLETED / FAILED / EJECTED / DELETED

Stores all sensor data: 3D dimensions, weights, timing, label info, deferred writes.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Integer, Float, ForeignKey, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OrderState(Base):
    __tablename__ = "order_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    machine_db_id: Mapped[str] = mapped_column(String(36), ForeignKey("machines.id"), nullable=False)

    # Order identification
    reference_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    barcode: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    barcode_type: Mapped[str] = mapped_column(String(50), default="")
    barcode_source: Mapped[str] = mapped_column(String(50), default="Keyboard")

    # State lifecycle
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="ASSIGNED", index=True)
    previous_state_before_delete: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Sequence for ordering and auto-ejection
    enq_sequence: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # ENQ data
    enq_result: Mapped[int] = mapped_column(Integer, default=1)  # 1=accept, 0=reject
    item_validated: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(String(500), default="")
    hazmat_flag: Mapped[bool] = mapped_column(Boolean, default=False)

    # Station flags (from ENQ response, matches simulator)
    lab1_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    lab2_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    inv_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # IND data (induction)
    inducted: Mapped[bool] = mapped_column(Boolean, default=False)

    # ACK data (3D sensor measurements)
    ack_result: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1=good, 0=bad
    ack_event: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ack_area_carton: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dimension_height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dimension_length_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dimension_width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # INV data (invoice printing)
    inv_printed: Mapped[bool] = mapped_column(Boolean, default=False)
    inv_pdf_pages: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # LAB1 data (primary labeler)
    lab1_result: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lab1_weight_scale: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Actual scale weight (g)
    lab1_weight_carton: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Carton weight (g)
    lab1_weight_content: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Content weight (g)
    lab1_match_barcode: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lab1_label_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # LAB2 data (secondary labeler, optional)
    lab2_result: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lab2_weight_scale: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lab2_weight_carton: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lab2_match_barcode: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # END data (exit verifier)
    end_status: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1=success, !=1=rejected
    end_good: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    final_length_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    final_weight_g: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Label & tracking (deferred writes)
    tracking_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    carrier: Mapped[str | None] = mapped_column(String(100), nullable=True)
    label_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # carrier, template, weclapp
    label_pre_created: Mapped[bool] = mapped_column(Boolean, default=False)

    # Resolution (for EJECTED/FAILED states)
    resolved_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    # Deletion (soft delete)
    deleted_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Ejection reason
    ejection_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps for every station (timing analysis t0→t10)
    enq_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ind_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ack_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    inv_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lab1_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lab2_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rem_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("ix_order_states_tenant_state", "tenant_id", "state"),
        Index("ix_order_states_machine_sequence", "machine_db_id", "enq_sequence"),
        Index("ix_order_states_machine_state", "machine_db_id", "state"),
    )
