"""order_states: persistierte Empfängeradresse (ship_to fürs Label = Anzeige)

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-17 18:00:00.000000

Die bei LAB1 aufgelöste Lieferadresse (genau die, die ans DHL-Label geht) wird
am OrderState gespeichert, damit das Dashboard sie OHNE Live-Call anzeigt — und
die Anzeige immer mit dem gedruckten Label übereinstimmt.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLS = [
    ("recipient_name", sa.String(120)),
    ("recipient_street", sa.String(120)),
    ("recipient_house_no", sa.String(20)),
    ("recipient_zip", sa.String(20)),
    ("recipient_city", sa.String(80)),
    ("recipient_country", sa.String(10)),
    ("recipient_email", sa.String(120)),
    ("recipient_phone", sa.String(40)),
]


def upgrade() -> None:
    for name, type_ in _COLS:
        op.add_column("order_states", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLS):
        op.drop_column("order_states", name)
