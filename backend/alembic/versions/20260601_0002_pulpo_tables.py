"""Pulpo integration tables: packing_orders, order_items, deferred_writes, sync_state

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-01 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pulpo_packing_orders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("pulpo_order_id", sa.String(100), nullable=False),
        sa.Column("cart_box_barcode", sa.String(255), nullable=False, server_default=""),
        sa.Column("state", sa.String(30), nullable=False, server_default="queue"),
        sa.Column("pick_location", sa.String(100), nullable=False, server_default=""),
        sa.Column("shipping_method", sa.String(100), nullable=False, server_default=""),
        sa.Column("carrier", sa.String(50), nullable=False, server_default=""),
        sa.Column("expected_weight_g", sa.Integer(), nullable=True),
        sa.Column("expected_length_mm", sa.Integer(), nullable=True),
        sa.Column("expected_width_mm", sa.Integer(), nullable=True),
        sa.Column("expected_height_mm", sa.Integer(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pulpo_packing_orders_tenant_id", "pulpo_packing_orders", ["tenant_id"])
    op.create_index("ix_pulpo_packing_orders_pulpo_order_id", "pulpo_packing_orders", ["pulpo_order_id"])
    op.create_index("ix_pulpo_packing_orders_cart_box_barcode", "pulpo_packing_orders", ["cart_box_barcode"])
    op.create_index("ix_pulpo_packing_orders_state", "pulpo_packing_orders", ["state"])
    op.create_index("ix_pulpo_packing_orders_pick_location", "pulpo_packing_orders", ["pick_location"])
    op.create_index("ix_pulpo_packing_orders_created_at", "pulpo_packing_orders", ["created_at"])
    op.create_index(
        "ix_pulpo_orders_tenant_pulpo", "pulpo_packing_orders",
        ["tenant_id", "pulpo_order_id"], unique=True,
    )
    op.create_index(
        "ix_pulpo_orders_tenant_state_loc", "pulpo_packing_orders",
        ["tenant_id", "state", "pick_location"],
    )

    op.create_table(
        "pulpo_order_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_db_id", sa.String(36),
                  sa.ForeignKey("pulpo_packing_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ean", sa.String(100), nullable=False, server_default=""),
        sa.Column("product_id", sa.String(100), nullable=False, server_default=""),
        sa.Column("product_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("raw_payload", sa.JSON(), nullable=False, server_default="{}"),
    )
    op.create_index("ix_pulpo_order_items_order_db_id", "pulpo_order_items", ["order_db_id"])
    op.create_index("ix_pulpo_order_items_ean", "pulpo_order_items", ["ean"])

    op.create_table(
        "pulpo_deferred_writes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("order_state_id", sa.String(36),
                  sa.ForeignKey("order_states.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step", sa.String(30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_pulpo_deferred_writes_order_state_id", "pulpo_deferred_writes", ["order_state_id"])
    op.create_index("ix_pulpo_deferred_writes_status", "pulpo_deferred_writes", ["status"])

    op.create_table(
        "pulpo_sync_state",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("pick_location", sa.String(100), nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_status", sa.String(30), nullable=False, server_default="never"),
        sa.Column("last_sync_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index(
        "ix_pulpo_sync_tenant_loc", "pulpo_sync_state",
        ["tenant_id", "pick_location"], unique=True,
    )


def downgrade() -> None:
    op.drop_table("pulpo_sync_state")
    op.drop_table("pulpo_deferred_writes")
    op.drop_table("pulpo_order_items")
    op.drop_table("pulpo_packing_orders")
