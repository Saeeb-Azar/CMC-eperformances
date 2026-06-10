"""Add order_states.is_test (orders created in Test-Modus)

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-10 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "order_states",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_order_states_is_test", "order_states", ["is_test"])


def downgrade() -> None:
    op.drop_index("ix_order_states_is_test", table_name="order_states")
    op.drop_column("order_states", "is_test")
