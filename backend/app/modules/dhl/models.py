"""Persistierte DHL-Sendungen.

Eine Zeile = eine erfolgreich erzeugte DHL-Sendung (mit Tracking-Nummer +
Label). Verknüpft optional mit dem OrderState (`order_state_id`), aus dem
sie entstand — so finden wir bei END/Retry die schon erzeugten Labels und
verhindern Doppel-Sendungen.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)
    # Optional: an welchen Auftrag hängt die Sendung? Bei Test-Sendungen leer.
    order_state_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("order_states.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    carrier: Mapped[str] = mapped_column(String(30), default="DHL", index=True)
    product: Mapped[str] = mapped_column(String(30), default="V01PAK")  # DHL Paket National
    tracking_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Versanddaten — kopiert aus dem Request, damit die Sendung in sich
    # nachvollziehbar bleibt (auch wenn der Auftrag später gelöscht wird).
    recipient_name: Mapped[str] = mapped_column(String(255), default="")
    recipient_zip: Mapped[str] = mapped_column(String(20), default="")
    recipient_city: Mapped[str] = mapped_column(String(120), default="")
    recipient_country: Mapped[str] = mapped_column(String(10), default="DEU")
    weight_g: Mapped[int] = mapped_column(Integer, default=0)
    length_mm: Mapped[int] = mapped_column(Integer, default=0)
    width_mm: Mapped[int] = mapped_column(Integer, default=0)
    height_mm: Mapped[int] = mapped_column(Integer, default=0)

    # Label selbst: Base64 (ZPL2 für Thermo-Druck, sonst PDF).
    label_b64: Mapped[str] = mapped_column(Text, default="")
    label_format: Mapped[str] = mapped_column(String(10), default="ZPL2")

    # True wenn im Test-Modus erzeugt (Mock-Sendung, kein echtes DHL-Label).
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # Druckqueue (Mini-Daemon im LAN holt offene Sendungen, druckt, meldet
    # zurück). `printed_at` = erfolgreich gedruckt; `print_error` = letzter
    # Fehler (für Retry-Sichtbarkeit). Reference-ID zum schnellen Mapping
    # ohne Order-Join.
    reference_id: Mapped[str] = mapped_column(String(100), default="", index=True)
    printed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    print_error: Mapped[str] = mapped_column(Text, default="")

    # Rohes DHL-Response-Payload — Debugging + spätere Felder.
    raw_response: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)

    __table_args__ = (
        Index("ix_shipments_tenant_created", "tenant_id", "created_at"),
    )
