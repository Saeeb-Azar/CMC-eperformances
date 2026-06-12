"""shipments: barcode + Pulpo-Referenzen (Reconstruction-Felder)

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-12 13:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shipments",
        sa.Column("barcode", sa.String(255), nullable=False, server_default=""))
    op.add_column("shipments",
        sa.Column("pulpo_sequence_number", sa.String(50), nullable=False, server_default=""))
    op.add_column("shipments",
        sa.Column("pulpo_sales_order_num", sa.String(100), nullable=False, server_default=""))
    op.create_index("ix_shipments_barcode", "shipments", ["barcode"])


def downgrade() -> None:
    op.drop_index("ix_shipments_barcode", table_name="shipments")
    op.drop_column("shipments", "pulpo_sales_order_num")
    op.drop_column("shipments", "pulpo_sequence_number")
    op.drop_column("shipments", "barcode")
