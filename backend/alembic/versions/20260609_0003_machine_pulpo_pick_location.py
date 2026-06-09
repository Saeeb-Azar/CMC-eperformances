"""Add machines.pulpo_pick_location

When set, a machine's CW-Liste is derived automatically from the Pulpo
packing queue at this origin_location_code (no manual barcode entry).

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-09 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "machines",
        sa.Column("pulpo_pick_location", sa.String(100), nullable=False, server_default=""),
    )
    op.create_index(
        "ix_machines_pulpo_pick_location", "machines", ["pulpo_pick_location"]
    )


def downgrade() -> None:
    op.drop_index("ix_machines_pulpo_pick_location", table_name="machines")
    op.drop_column("machines", "pulpo_pick_location")
