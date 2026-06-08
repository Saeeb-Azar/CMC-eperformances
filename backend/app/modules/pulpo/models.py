"""DB-Modelle für die Pulpo-Integration.

Vier Tabellen:
  - pulpo_packing_orders : eine Packing-Order aus Pulpo (= eine Bestellung
    die für die Maschine bereitsteht). Aus dem `packing_order_created`-
    Webhook befüllt, beim `packing_order_finished` als „closed" markiert.
  - pulpo_order_items    : Produkt-Positionen innerhalb einer Order. Beim
    Single-Order-Pfad wird der EAN-Barcode hier durchsucht.
  - pulpo_deferred_writes: Queue der noch-zu-sendenden Pulpo-API-Calls
    während ein Paket auf dem Band ist. Erst bei END (Status 1) werden
    sie in Reihenfolge replayed (siehe cmc-process-doc § 5).
  - pulpo_sync_state     : Frische-Status pro Pick-Location, damit wir
    bei Cache-Miss entscheiden können ob ein Full-Resync von Pulpo nötig
    ist (Self-Healing aus cmc-process-doc § 3).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PulpoPackingOrder(Base):
    __tablename__ = "pulpo_packing_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False, index=True)

    # Pulpo-seitige IDs — eindeutig pro Mandant.
    pulpo_order_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Bei Multi-Order-Path: der vergebene CartBox-Barcode (z.B. "M319991").
    # Bei Single-Order-Path: leer / NULL.
    cart_box_barcode: Mapped[str] = mapped_column(String(255), default="", index=True)

    # Lebenszyklus aus Pulpo-Sicht: "queue" | "reserved" | "completed" | "closed"
    # "reserved" = wir haben die Order gerade einer Maschine zugewiesen.
    state: Mapped[str] = mapped_column(String(30), default="queue", index=True)

    # Logistik-Metadaten — werden für Carrier-Anbindung und FIFO-Auswahl gebraucht.
    pick_location: Mapped[str] = mapped_column(String(100), default="", index=True)
    shipping_method: Mapped[str] = mapped_column(String(100), default="")
    carrier: Mapped[str] = mapped_column(String(50), default="")

    # Erwartete Versanddaten — wir vergleichen die im ACK / LAB1 mit den
    # Ist-Werten der Maschine, um Größen-/Gewichtsabweichungen zu erkennen.
    expected_weight_g: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_length_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_width_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_height_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Volles Webhook-Payload — für Debugging und für Felder die wir aktuell
    # noch nicht extrahieren, sobald die Pulpo-Doku da ist.
    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["PulpoOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_pulpo_orders_tenant_pulpo", "tenant_id", "pulpo_order_id", unique=True),
        Index("ix_pulpo_orders_tenant_state_loc", "tenant_id", "state", "pick_location"),
    )


class PulpoOrderItem(Base):
    __tablename__ = "pulpo_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_db_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pulpo_packing_orders.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Produkt-EAN/GTIN — der Single-Order-Pfad sucht hier nach dem
    # gescannten Barcode. Eine Order kann mehrere Items haben; jeder EAN
    # darin macht die Order „greifbar" für einen Scan dieses EAN.
    ean: Mapped[str] = mapped_column(String(100), default="", index=True)
    product_id: Mapped[str] = mapped_column(String(100), default="")
    product_name: Mapped[str] = mapped_column(String(255), default="")
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    raw_payload: Mapped[dict] = mapped_column(JSON, default=dict)

    order: Mapped[PulpoPackingOrder] = relationship(back_populates="items")


class PulpoDeferredWrite(Base):
    __tablename__ = "pulpo_deferred_writes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Welches Paket auf dem Band gehört dazu? OrderState ist unser internes
    # Lebenszyklus-Modell (siehe modules/orders/models.py).
    order_state_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("order_states.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Welcher Schritt aus der Lifecycle-Sequenz?
    # accept | update_box | attach_label | finish | close
    step: Mapped[str] = mapped_column(String(30), nullable=False)

    # Was an Pulpo geschickt werden soll. Konkretes Format hängt vom
    # Endpoint ab — wird beim Bauen der Sequenz vom Service befüllt.
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    # pending | success | failed | abandoned
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PulpoSyncState(Base):
    """Frische-Marker pro Pick-Location: letzter erfolgreicher Full-Sync.

    Wir prüfen bei Cache-Miss: ist diese Location frisch (z.B. < 60s)? Dann
    ist ein Miss vermutlich legitim (kein passender Auftrag), wir antworten
    UNKNOWN. Sonst stoßen wir einen Resync an (Self-Healing).
    """
    __tablename__ = "pulpo_sync_state"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id"), nullable=False)
    pick_location: Mapped[str] = mapped_column(String(100), nullable=False)

    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[str] = mapped_column(String(30), default="never")
    last_sync_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")

    __table_args__ = (
        Index("ix_pulpo_sync_tenant_loc", "tenant_id", "pick_location", unique=True),
    )
