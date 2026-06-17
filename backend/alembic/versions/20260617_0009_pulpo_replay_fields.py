"""order_states: Pulpo deferred-write-Replay-Felder

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-17 09:00:00.000000

Sammelt den Replay-Status der deferred Pulpo-Schreibvorgänge (accept→box→
label→finish→close), die genau EINMAL bei END status=1 abgespielt werden.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("order_states",
        sa.Column("pulpo_replay_state", sa.String(20), nullable=False, server_default="NONE"))
    op.add_column("order_states",
        sa.Column("pulpo_box_id", sa.String(100), nullable=True))
    op.add_column("order_states",
        sa.Column("pulpo_replay_error", sa.Text(), nullable=True))
    op.create_index("ix_order_states_pulpo_replay_state", "order_states", ["pulpo_replay_state"])


def downgrade() -> None:
    op.drop_index("ix_order_states_pulpo_replay_state", table_name="order_states")
    op.drop_column("order_states", "pulpo_replay_error")
    op.drop_column("order_states", "pulpo_box_id")
    op.drop_column("order_states", "pulpo_replay_state")
