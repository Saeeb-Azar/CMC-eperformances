"""order_states: pulpo_order_id (gebundener Pulpo-Auftrag pro Scan)

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-16 16:10:00.000000

Speichert den KONKRETEN Pulpo-Packauftrag, an den ein Scan (reference_id)
gebunden wurde — die EINE Wahrheit für Label, Detailansicht und Auftragsliste.
Verhindert, dass verschiedene Ansichten den Barcode unabhängig (und bei
mehrfach vorkommendem Artikel-EAN unterschiedlich/falsch) auflösen.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("order_states",
        sa.Column("pulpo_order_id", sa.String(100), nullable=True))
    op.create_index("ix_order_states_pulpo_order_id", "order_states", ["pulpo_order_id"])


def downgrade() -> None:
    op.drop_index("ix_order_states_pulpo_order_id", table_name="order_states")
    op.drop_column("order_states", "pulpo_order_id")
