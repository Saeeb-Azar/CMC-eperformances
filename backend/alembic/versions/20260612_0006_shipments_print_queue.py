"""shipments: print queue columns

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-12 11:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shipments",
        sa.Column("reference_id", sa.String(100), nullable=False, server_default=""))
    op.add_column("shipments",
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("shipments",
        sa.Column("print_error", sa.Text(), nullable=False, server_default=""))
    op.create_index("ix_shipments_reference_id", "shipments", ["reference_id"])
    op.create_index("ix_shipments_printed_at", "shipments", ["printed_at"])


def downgrade() -> None:
    op.drop_index("ix_shipments_printed_at", table_name="shipments")
    op.drop_index("ix_shipments_reference_id", table_name="shipments")
    op.drop_column("shipments", "print_error")
    op.drop_column("shipments", "printed_at")
    op.drop_column("shipments", "reference_id")
