"""Demo-/Test-API — kompletter Maschinendurchlauf per Knopfdruck, ohne Lager,
ohne echte Maschine, ohne echte Pulpo-Packliste und ohne echte DHL-Sendung.

Ablauf von ``POST /demo/run``:
  1. Sorgt für eine Demo-Maschine (LAB1 aktiv) in der Registry.
  2. Legt einen lokalen TEST-Packauftrag an (Testprodukt + Testempfänger),
     Markierung über ``pulpo_order_id`` mit Präfix ``TEST-`` (kein Migrations-
     bedarf; vom Pulpo-Resync-Self-Heal ausgenommen).
  3. Pusht die CW-Liste, sodass der Scan matcht.
  4. Spielt ENQ→IND→ACK→LAB1→END gegen den eigenen Gateway-Port — der echte
     Pfad inkl. DHL-Test-Label (gerendertes PDF mit den Testdaten).
  5. Gibt Referenz, Tracking und Label-Infos zurück.

Alles läuft nur, solange Test-Modus aktiv ist (keine echten Daten/Sendungen).
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import logger
from app.core.permissions import get_current_user
from app.gateway.connection import connection_manager
from app.modules.dhl.models import Shipment
from app.modules.dhl.runtime import dhl_runtime
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.pulpo import cw_sync
from app.modules.pulpo.models import PulpoOrderItem, PulpoPackingOrder
from app.modules.pulpo.runtime import pulpo_runtime

from .simulator import run_demo_flow

router = APIRouter(prefix="/demo", tags=["demo"])

DEMO_MACHINE_ID = "SIM-DEMO"


class Recipient(BaseModel):
    name: str = "Erika Mustermann"
    company: str = ""
    street: str = "Teststraße"
    house_nr: str = "42"
    zip: str = "10115"
    city: str = "Berlin"
    country: str = "DEU"
    email: str = "test@example.com"
    phone: str = "030 1234567"


class DemoRunRequest(BaseModel):
    product_name: str = "Test-Artikel Promanal"
    product_sku: str = "TEST-SKU-001"
    product_ean: str = "4000000000017"
    product_image_url: str = ""
    quantity: int = Field(default=1, ge=1, le=99)
    barcode: str = ""  # leer → automatisch eindeutig generiert
    recipient: Recipient = Field(default_factory=Recipient)
    weight_g: int = Field(default=500, gt=0, le=31_500)
    length_mm: int = Field(default=200, gt=0, le=2000)
    width_mm: int = Field(default=150, gt=0, le=2000)
    height_mm: int = Field(default=80, gt=0, le=2000)
    machine_id: str = DEMO_MACHINE_ID


async def _ensure_demo_machine(db: AsyncSession, tenant_id: str, machine_id: str) -> Machine:
    m = (await db.execute(
        select(Machine).where(
            Machine.tenant_id == tenant_id, Machine.machine_id == machine_id,
        ).limit(1)
    )).scalar_one_or_none()
    if m is None:
        m = Machine(
            tenant_id=tenant_id, machine_id=machine_id,
            name="Demo-Simulator (Test)", lab1_enabled=True, lab2_enabled=False,
            inv_enabled=False, is_active=True, pulpo_pick_location="",
        )
        db.add(m)
    else:
        m.is_active = True
        m.lab1_enabled = True
    await db.flush()
    return m


def _build_raw_payload(req: DemoRunRequest, barcode: str, seq: str) -> dict:
    r = req.recipient
    return {
        "id": seq,
        "sequence_number": seq,
        "state": "queue",
        "cart_box_barcode": barcode,
        "origin_location_code": "DEMO",
        "shipment_method_name": "DHL Paket (Test)",
        "sales_order_ref": seq,
        "sales_order": {
            "order_num": seq,
            "shipment_method_name": "DHL Paket (Test)",
            "ship_to": {
                "name": r.name,
                "company_name": r.company,
                "phone_number": r.phone,
                "address": {
                    "street": r.street, "house_nr": r.house_nr,
                    "zip": r.zip, "city": r.city,
                    "country": r.country, "country_code": r.country,
                    "email": r.email,
                },
            },
        },
        "items": [{
            "requested_quantity": req.quantity,
            "quantity": req.quantity,
            "ean": req.product_ean,
            "product_id": req.product_sku,
            "product": {
                "id": req.product_sku,
                "sku": req.product_sku,
                "name": req.product_name,
                "barcodes": [req.product_ean] if req.product_ean else [],
                "image_url": req.product_image_url,
                "attributes": {},
            },
        }],
    }


class DryRunRequest(BaseModel):
    machine_id: str = DEMO_MACHINE_ID   # protocol_id der Maschine
    cw_list: str = ""                   # optional, nur fürs Tag
    barcodes: list[str] = Field(default_factory=list, min_length=1)


@router.post("/dry-run-scan")
async def demo_dry_run_scan(
    req: DryRunRequest,
    user: dict = Depends(get_current_user),
):
    """DRY-RUN: simuliert die Auftrags-/Adress-/Label-Zuordnung für eine Liste
    von Barcodes mit ECHTEN Pulpo-Daten — read-only, rollback-only, KEIN
    DHL-Call. Zeigt pro Scan: erkannte CW-Liste, gebundener Auftrag (PA-/
    Verkaufsauftragsnummer), Empfänger inkl. Adresse, Label-VORSCHAU (Base64);
    bei Überzahl explizit „würde abgelehnt". Nichts wird gespeichert/versendet.

    Hinweis: prüft die Software-Zuordnung, NICHT das physische Maschinen-Timing.
    """
    results = await connection_manager.dry_run_scan(
        (req.machine_id or DEMO_MACHINE_ID).strip(),
        req.cw_list.strip() or None,
        list(req.barcodes),
    )
    return {
        "ok": True,
        "machine_id": (req.machine_id or DEMO_MACHINE_ID).strip(),
        "count": len(results),
        "note": "DRY-RUN — read-only, rollback-only, keine Sendung, keine Speicherung",
        "results": results,
    }


@router.get("/status")
async def demo_status(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    tenant_id = user["tenant_id"]
    actual_port = connection_manager.bound_port or get_settings().cmc_tcp_port
    open_test_orders = (await db.execute(
        select(PulpoPackingOrder.id).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id.like("TEST-%"),
            PulpoPackingOrder.state == "queue",
        )
    )).all()
    return {
        "pulpo_test_mode": pulpo_runtime.test_mode,
        "dhl_test_mode": dhl_runtime.test_mode,
        "gateway_port": actual_port,
        "demo_machine_id": DEMO_MACHINE_ID,
        "open_test_orders": len(open_test_orders),
    }


@router.post("/run")
async def demo_run(
    req: DemoRunRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Kompletter simulierter Durchlauf inkl. Test-Label."""
    if not (pulpo_runtime.test_mode and dhl_runtime.test_mode):
        raise HTTPException(
            status_code=400,
            detail="Demo-Durchlauf nur im Test-Modus erlaubt (Pulpo + DHL). "
                   "Bitte erst Test-Modus aktivieren.",
        )

    tenant_id = user["tenant_id"]
    machine_id = (req.machine_id or DEMO_MACHINE_ID).strip() or DEMO_MACHINE_ID

    await _ensure_demo_machine(db, tenant_id, machine_id)

    # WICHTIG: Der Scan-Barcode des Demo-Durchlaufs muss EINDEUTIG und KEIN
    # echter Produkt-EAN sein. Sonst kollidiert er mit echten Pulpo-Aufträgen
    # (gleicher Artikel) und die LAB1-Auflösung zieht deren echtes Label/
    # Empfänger (z.B. „Leonard Fink"). Wir generieren deshalb IMMER einen
    # eindeutigen DEMO-Barcode als Karton-Scan — der echte Produkt-EAN bleibt
    # nur am Artikel (fürs Bild/die Anzeige). Ein optional eingegebener Barcode
    # wird mit „DEMO-" präfixiert, damit er ebenfalls eindeutig bleibt.
    user_bc = (req.barcode or "").strip()
    barcode = f"DEMO-{user_bc}" if user_bc else f"DEMO-{uuid.uuid4().hex[:10].upper()}"
    seq = f"TEST-{uuid.uuid4().hex[:8].upper()}"

    # Alte Demo-Aufträge schließen, damit die CW-Liste schlank bleibt.
    old = (await db.execute(
        select(PulpoPackingOrder).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id.like("TEST-%"),
            PulpoPackingOrder.state == "queue",
        )
    )).scalars().all()
    for o in old:
        o.state = "closed"
        o.updated_at = datetime.now(timezone.utc)

    raw = _build_raw_payload(req, barcode, seq)
    order = PulpoPackingOrder(
        tenant_id=tenant_id, pulpo_order_id=seq, cart_box_barcode=barcode,
        state="queue", pick_location="DEMO", shipping_method="DHL Paket (Test)",
        carrier="DHL", expected_weight_g=req.weight_g,
        expected_length_mm=req.length_mm, expected_width_mm=req.width_mm,
        expected_height_mm=req.height_mm, raw_payload=raw,
    )
    db.add(order)
    await db.flush()
    db.add(PulpoOrderItem(
        order_db_id=order.id, ean=req.product_ean,
        product_id=req.product_sku, product_name=req.product_name,
        quantity=req.quantity, raw_payload=raw["items"][0],
    ))
    # Committen, damit der Gateway-Pfad (separate Session) den Auftrag sieht.
    await db.commit()

    # CW-Liste der Demo-Maschine aufbauen → Scan matcht.
    await cw_sync.sync_cw_lists_from_cache(db)

    host = "127.0.0.1"
    port = connection_manager.bound_port or get_settings().cmc_tcp_port
    result = await run_demo_flow(
        host=host, port=port, machine_id=machine_id, barcode=barcode,
        length_mm=req.length_mm, width_mm=req.width_mm, height_mm=req.height_mm,
        weight_g=req.weight_g, event=int(time.time()) % 9000 + 1000,
    )

    # Dem Gateway (separate Session, Hintergrund-Tasks) kurz Zeit geben,
    # Label + OrderState zu persistieren.
    shipment = None
    order_state = None
    ref = result.reference_id
    if ref:
        for _ in range(20):  # bis ~3s
            shipment = (await db.execute(
                select(Shipment).where(
                    Shipment.tenant_id == tenant_id,
                    Shipment.reference_id == ref,
                ).order_by(Shipment.created_at.desc()).limit(1)
            )).scalar_one_or_none()
            order_state = (await db.execute(
                select(OrderState).where(
                    OrderState.tenant_id == tenant_id,
                    OrderState.reference_id == ref,
                ).order_by(OrderState.created_at.desc()).limit(1)
            )).scalar_one_or_none()
            if shipment is not None:
                break
            await asyncio.sleep(0.15)

    return {
        "ok": result.accepted and not result.error,
        "error": result.error or "",
        "reference_id": ref,
        "barcode": barcode,
        "machine_id": machine_id,
        "packing_order": seq,
        "order_state": (
            {"state": order_state.state, "is_test": order_state.is_test}
            if order_state else None
        ),
        "shipment": (
            {
                "tracking_number": shipment.tracking_number,
                "label_format": shipment.label_format,
                "has_label": bool(shipment.label_b64),
                "is_test": shipment.is_test,
            } if shipment else None
        ),
        "steps": result.steps,
    }


@router.post("/cleanup")
async def demo_cleanup(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Alle Demo-/Testdaten dieses Mandanten entfernen."""
    tenant_id = user["tenant_id"]

    test_orders = (await db.execute(
        select(PulpoPackingOrder.id).where(
            PulpoPackingOrder.tenant_id == tenant_id,
            PulpoPackingOrder.pulpo_order_id.like("TEST-%"),
        )
    )).scalars().all()
    if test_orders:
        await db.execute(delete(PulpoOrderItem).where(PulpoOrderItem.order_db_id.in_(test_orders)))
        await db.execute(delete(PulpoPackingOrder).where(PulpoPackingOrder.id.in_(test_orders)))

    # Refs der Test-OrderStates einsammeln — darüber löschen wir AUCH
    # versehentlich darunter gelandete „echte" Shipments (is_test=False),
    # falls aus früheren Läufen ein fremdes Label (z.B. „Leonard") an einer
    # Demo-Referenz klebt.
    test_refs = (await db.execute(
        select(OrderState.reference_id).where(
            OrderState.tenant_id == tenant_id, OrderState.is_test.is_(True),
        )
    )).scalars().all()

    from sqlalchemy import or_ as _or
    sh_filter = [Shipment.is_test.is_(True), Shipment.barcode.like("DEMO-%")]
    if test_refs:
        sh_filter.append(Shipment.reference_id.in_(list(set(test_refs))))
    sh = await db.execute(delete(Shipment).where(
        Shipment.tenant_id == tenant_id, _or(*sh_filter),
    ))
    os_ = await db.execute(delete(OrderState).where(
        OrderState.tenant_id == tenant_id, OrderState.is_test.is_(True),
    ))
    await db.commit()
    await cw_sync.sync_cw_lists_from_cache(db)
    logger.info(
        f"Demo-Cleanup tenant={tenant_id}: orders={len(test_orders)} "
        f"shipments={sh.rowcount} order_states={os_.rowcount}"
    )
    return {
        "ok": True,
        "removed": {
            "packing_orders": len(test_orders),
            "shipments": sh.rowcount,
            "order_states": os_.rowcount,
        },
    }
