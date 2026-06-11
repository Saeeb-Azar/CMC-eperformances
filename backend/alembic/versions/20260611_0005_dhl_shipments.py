"""DHL shipments table

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-11 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shipments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("order_state_id", sa.String(36),
                  sa.ForeignKey("order_states.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("carrier", sa.String(30), nullable=False, server_default="DHL"),
        sa.Column("product", sa.String(30), nullable=False, server_default="V01PAK"),
        sa.Column("tracking_number", sa.String(50), nullable=False, index=True),
        sa.Column("recipient_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("recipient_zip", sa.String(20), nullable=False, server_default=""),
        sa.Column("recipient_city", sa.String(120), nullable=False, server_default=""),
        sa.Column("recipient_country", sa.String(10), nullable=False, server_default="DEU"),
        sa.Column("weight_g", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("length_mm", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("width_mm", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("height_mm", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("label_b64", sa.Text(), nullable=False, server_default=""),
        sa.Column("label_format", sa.String(10), nullable=False, server_default="ZPL2"),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raw_response", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index("ix_shipments_tenant_created", "shipments", ["tenant_id", "created_at"])
    op.create_index("ix_shipments_is_test", "shipments", ["is_test"])


def downgrade() -> None:
    op.drop_index("ix_shipments_is_test", table_name="shipments")
    op.drop_index("ix_shipments_tenant_created", table_name="shipments")
    op.drop_table("shipments")
