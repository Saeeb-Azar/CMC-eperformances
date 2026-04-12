"""Initial schema: tenants, users, machines, heartbeat_logs, order_states, audit_logs

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── tenants ───────────────────────────────────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("plan", sa.String(50), nullable=False, server_default="starter"),
        sa.Column("settings", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"], unique=True)

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])

    # ── machines ──────────────────────────────────────────────────────────────
    op.create_table(
        "machines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("machine_id", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("model", sa.String(100), nullable=False, server_default="CW1000"),
        # TCP connection config
        sa.Column("tcp_role", sa.String(10), nullable=False, server_default="server"),
        sa.Column("tcp_host", sa.String(255), nullable=False, server_default="127.0.0.1"),
        sa.Column("tcp_port", sa.Integer(), nullable=False, server_default="15001"),
        # Capabilities
        sa.Column("lab1_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("lab2_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("inv_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("pre_create_labels", sa.Boolean(), nullable=False, server_default="true"),
        # Dimension limits
        sa.Column("max_length_mm", sa.Integer(), nullable=False, server_default="6000"),
        sa.Column("max_width_mm", sa.Integer(), nullable=False, server_default="4000"),
        sa.Column("max_height_mm", sa.Integer(), nullable=False, server_default="3000"),
        # State
        sa.Column("status", sa.String(20), nullable=False, server_default="STOP"),
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("enq_sequence", sa.Integer(), nullable=False, server_default="0"),
        # Timestamps
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_machines_tenant_id", "machines", ["tenant_id"])
    op.create_index("ix_machines_machine_id", "machines", ["machine_id"])

    # ── heartbeat_logs ────────────────────────────────────────────────────────
    op.create_table(
        "heartbeat_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "machine_db_id",
            sa.String(36),
            sa.ForeignKey("machines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("is_online", sa.Boolean(), nullable=False),
        sa.Column("response_time_ms", sa.Integer(), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_heartbeat_logs_machine_db_id", "heartbeat_logs", ["machine_db_id"])
    op.create_index("ix_heartbeat_logs_timestamp", "heartbeat_logs", ["timestamp"])

    # ── order_states ──────────────────────────────────────────────────────────
    op.create_table(
        "order_states",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "machine_db_id",
            sa.String(36),
            sa.ForeignKey("machines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Identification
        sa.Column("reference_id", sa.String(100), nullable=False),
        sa.Column("barcode", sa.String(255), nullable=False),
        sa.Column("barcode_type", sa.String(50), nullable=False, server_default=""),
        sa.Column("barcode_source", sa.String(50), nullable=False, server_default="Keyboard"),
        # State lifecycle
        sa.Column("state", sa.String(20), nullable=False, server_default="ASSIGNED"),
        sa.Column("previous_state_before_delete", sa.String(20), nullable=True),
        sa.Column("enq_sequence", sa.Integer(), nullable=False),
        # ENQ data
        sa.Column("enq_result", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("item_validated", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("hazmat_flag", sa.Boolean(), nullable=False, server_default="false"),
        # Station flags
        sa.Column("lab1_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("lab2_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("inv_enabled", sa.Boolean(), nullable=False, server_default="false"),
        # IND data
        sa.Column("inducted", sa.Boolean(), nullable=False, server_default="false"),
        # ACK data (3D sensor)
        sa.Column("ack_result", sa.Integer(), nullable=True),
        sa.Column("ack_event", sa.Integer(), nullable=True),
        sa.Column("ack_area_carton", sa.Integer(), nullable=True),
        sa.Column("dimension_height_mm", sa.Integer(), nullable=True),
        sa.Column("dimension_length_mm", sa.Integer(), nullable=True),
        sa.Column("dimension_width_mm", sa.Integer(), nullable=True),
        # INV data
        sa.Column("inv_printed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("inv_pdf_pages", sa.Integer(), nullable=True),
        # LAB1 data
        sa.Column("lab1_result", sa.Integer(), nullable=True),
        sa.Column("lab1_weight_scale", sa.Integer(), nullable=True),
        sa.Column("lab1_weight_carton", sa.Integer(), nullable=True),
        sa.Column("lab1_weight_content", sa.Integer(), nullable=True),
        sa.Column("lab1_match_barcode", sa.String(255), nullable=True),
        sa.Column("lab1_label_url", sa.Text(), nullable=True),
        # LAB2 data
        sa.Column("lab2_result", sa.Integer(), nullable=True),
        sa.Column("lab2_weight_scale", sa.Integer(), nullable=True),
        sa.Column("lab2_weight_carton", sa.Integer(), nullable=True),
        sa.Column("lab2_match_barcode", sa.String(255), nullable=True),
        # END data (exit verifier)
        sa.Column("end_status", sa.Integer(), nullable=True),
        sa.Column("end_good", sa.Boolean(), nullable=True),
        sa.Column("final_length_mm", sa.Integer(), nullable=True),
        sa.Column("final_width_mm", sa.Integer(), nullable=True),
        sa.Column("final_height_mm", sa.Integer(), nullable=True),
        sa.Column("final_weight_g", sa.Integer(), nullable=True),
        # Label & tracking
        sa.Column("tracking_number", sa.String(255), nullable=True),
        sa.Column("tracking_url", sa.Text(), nullable=True),
        sa.Column("carrier", sa.String(100), nullable=True),
        sa.Column("label_type", sa.String(50), nullable=True),
        sa.Column("label_pre_created", sa.Boolean(), nullable=False, server_default="false"),
        # Resolution
        sa.Column("resolved_by", sa.String(36), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_reason", sa.Text(), nullable=True),
        sa.Column("failure_resolved", sa.Boolean(), nullable=False, server_default="false"),
        # Soft delete
        sa.Column("deleted_by", sa.String(36), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ejection_reason", sa.String(100), nullable=True),
        # Station timestamps (timing analysis t0→t10)
        sa.Column("enq_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ind_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ack_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("inv_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lab1_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lab2_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rem_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_order_states_reference_id", "order_states", ["reference_id"])
    op.create_index("ix_order_states_barcode", "order_states", ["barcode"])
    op.create_index("ix_order_states_state", "order_states", ["state"])
    op.create_index("ix_order_states_enq_sequence", "order_states", ["enq_sequence"])
    op.create_index(
        "ix_order_states_tenant_state", "order_states", ["tenant_id", "state"]
    )
    op.create_index(
        "ix_order_states_machine_sequence", "order_states", ["machine_db_id", "enq_sequence"]
    )
    op.create_index(
        "ix_order_states_machine_state", "order_states", ["machine_db_id", "state"]
    )

    # ── audit_logs ────────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("actor_type", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.String(100), nullable=True),
        sa.Column("machine_id", sa.String(50), nullable=True),
        sa.Column("reference_id", sa.String(100), nullable=True),
        sa.Column("order_id", sa.String(36), nullable=True),
        sa.Column("previous_state", sa.String(20), nullable=True),
        sa.Column("new_state", sa.String(20), nullable=True),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("response_time_ms", sa.Integer(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    op.create_index("ix_audit_logs_event_type", "audit_logs", ["event_type"])
    op.create_index("ix_audit_logs_category", "audit_logs", ["category"])
    op.create_index("ix_audit_logs_machine_id", "audit_logs", ["machine_id"])
    op.create_index("ix_audit_logs_reference_id", "audit_logs", ["reference_id"])
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])
    op.create_index(
        "ix_audit_tenant_timestamp", "audit_logs", ["tenant_id", "timestamp"]
    )
    op.create_index(
        "ix_audit_category_event", "audit_logs", ["category", "event_type"]
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("order_states")
    op.drop_table("heartbeat_logs")
    op.drop_table("machines")
    op.drop_table("users")
    op.drop_table("tenants")
