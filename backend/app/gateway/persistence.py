"""
Persist incoming CMC CIS events to the database.

Flow:
  Simulator → parser → connection._read_loop → persist_event()
                                                ├── upsert OrderState
                                                └── append AuditLog

Without this, live events would only be visible in the simulator feed
and never show up on the dashboard, orders, audit, or analytics pages.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.core.database import async_session
from app.core.logging import logger
from app.core.security import hash_password
from app.modules.audit.models import AuditLog
from app.modules.auth.models import User
from app.modules.machines.models import Machine
from app.modules.orders.models import OrderState
from app.modules.tenants.models import Tenant


DEFAULT_TENANT_SLUG = "default"
DEFAULT_TENANT_NAME = "Default Tenant"
# Pydantic EmailStr (via email-validator) rejects ".local" because it's
# reserved for mDNS, not a real TLD — and login would return 422. Use a
# plain ".de" domain so the default creds actually round-trip.
DEFAULT_ADMIN_EMAIL = os.environ.get("DEFAULT_ADMIN_EMAIL", "admin@eperformances.de")
DEFAULT_ADMIN_PASSWORD = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123")
DEFAULT_ADMIN_NAME = "Default Admin"


async def bootstrap_defaults() -> None:
    """Ensure the app has a default tenant and an admin user so the UI is
    usable on first boot without manual DB seeding. Safe to call repeatedly.
    """
    async with async_session() as db:
        try:
            tenant = await _get_or_create_default_tenant(db)
            await _get_or_create_default_admin(db, tenant)
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"bootstrap_defaults failed: {e}", exc_info=True)


def _int(v: Any) -> int | None:
    try:
        return int(str(v).strip()) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).strip() in ("1", "true", "True", "yes")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def persist_event(event_type: str, payload: dict) -> None:
    """Upsert OrderState + append AuditLog for a single CMC event."""
    machine_id = payload.get("machine_id") or ""
    if not machine_id:
        return

    async with async_session() as db:
        try:
            machine = await _get_or_create_machine(db, machine_id)
            order, prev_state = await _apply_event(db, machine, event_type, payload)
            await _write_audit(db, machine, order, event_type, payload, prev_state)
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"persist_event({event_type}) failed: {e}", exc_info=True)


async def _get_or_create_machine(db, machine_id: str) -> Machine:
    """Look up the machine by its CIS id, auto-provision tenant + machine
    on first contact so the simulator works without manual setup.
    """
    res = await db.execute(
        select(Machine).where(Machine.machine_id == machine_id)
    )
    machine = res.scalar_one_or_none()
    if machine is not None:
        return machine

    tenant = await _get_or_create_default_tenant(db)
    machine = Machine(
        tenant_id=tenant.id,
        machine_id=machine_id,
        name=f"Simulator {machine_id}",
        model="CW1000",
        tcp_role="server",
        tcp_host="0.0.0.0",
        tcp_port=15001,
        status="RUNNING",
        is_online=True,
    )
    db.add(machine)
    await db.flush()  # so machine.id is available for following inserts
    logger.info(f"Auto-provisioned machine {machine_id} under tenant {tenant.slug}")
    return machine


async def _get_or_create_default_tenant(db) -> Tenant:
    res = await db.execute(
        select(Tenant).where(Tenant.slug == DEFAULT_TENANT_SLUG)
    )
    tenant = res.scalar_one_or_none()
    if tenant is not None:
        return tenant
    tenant = Tenant(
        name=DEFAULT_TENANT_NAME,
        slug=DEFAULT_TENANT_SLUG,
        plan="enterprise",
        is_active=True,
    )
    db.add(tenant)
    await db.flush()
    logger.info(f"Auto-provisioned default tenant {tenant.id}")
    return tenant


async def _get_or_create_default_admin(db, tenant: Tenant) -> User:
    res = await db.execute(
        select(User).where(User.email == DEFAULT_ADMIN_EMAIL)
    )
    user = res.scalar_one_or_none()
    if user is not None:
        return user
    user = User(
        email=DEFAULT_ADMIN_EMAIL,
        hashed_password=hash_password(DEFAULT_ADMIN_PASSWORD),
        full_name=DEFAULT_ADMIN_NAME,
        role="super_admin",
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    logger.info(
        "Auto-provisioned default admin user — email=%s  password=%s (set DEFAULT_ADMIN_EMAIL/DEFAULT_ADMIN_PASSWORD env vars to override)",
        DEFAULT_ADMIN_EMAIL,
        DEFAULT_ADMIN_PASSWORD,
    )
    return user


async def _find_order(db, machine: Machine, reference_id: str) -> OrderState | None:
    if not reference_id:
        return None
    res = await db.execute(
        select(OrderState)
        .where(
            OrderState.machine_db_id == machine.id,
            OrderState.reference_id == reference_id,
        )
        .order_by(OrderState.created_at.desc())
    )
    return res.scalars().first()


async def _apply_event(
    db, machine: Machine, event_type: str, payload: dict
) -> tuple[OrderState | None, str | None]:
    """Apply the event to the order lifecycle. Returns (order, previous_state)."""
    ref = payload.get("reference_id") or ""
    now = _now()
    prev_state: str | None = None

    # Every event marks the machine as alive
    machine.last_event_at = now
    machine.is_online = True
    if machine.status in ("STOP", "OFFLINE"):
        machine.status = "RUNNING"

    if event_type == "HBT":
        machine.last_heartbeat_at = now
        return None, None

    if event_type == "ENQ":
        # ENQ is the first touch — create a new order unless one already exists
        barcode = payload.get("barcode", "") or ref or ""
        ref = ref or f"ref-{barcode or now.strftime('%H%M%S')}"
        existing = await _find_order(db, machine, ref)
        if existing:
            return existing, existing.state
        # Bump ENQ sequence on the machine
        machine.enq_sequence = (machine.enq_sequence or 0) + 1
        order = OrderState(
            tenant_id=machine.tenant_id,
            machine_db_id=machine.id,
            reference_id=ref,
            barcode=barcode,
            barcode_type=payload.get("barcode_type", ""),
            barcode_source=_source_label(payload.get("source")),
            state="ASSIGNED",
            enq_sequence=machine.enq_sequence,
            enq_at=now,
        )
        db.add(order)
        return order, None

    order = await _find_order(db, machine, ref)
    if order is None:
        return None, None

    prev_state = order.state

    if event_type == "IND":
        order.inducted = True
        order.ind_at = now
        order.state = "INDUCTED"

    elif event_type == "ACK":
        order.ack_at = now
        order.ack_event = _int(payload.get("event"))
        order.ack_result = 1 if _bool(payload.get("good")) else 0
        order.ack_area_carton = _int(payload.get("area_carton"))
        order.dimension_height_mm = _int(payload.get("height_mm"))
        order.dimension_length_mm = _int(payload.get("length_mm"))
        order.dimension_width_mm = _int(payload.get("width_mm"))
        order.state = "SCANNED" if order.ack_result else "EJECTED"
        if not order.ack_result:
            order.ejection_reason = "dimensions_rejected"

    elif event_type == "INV":
        order.inv_at = now
        order.inv_printed = True
        order.inv_pdf_pages = _int(payload.get("num_pages"))

    elif event_type == "LAB1":
        order.lab1_at = now
        order.lab1_result = 1 if _bool(payload.get("good")) else 0
        order.lab1_weight_scale = _int(payload.get("weight_scale"))
        order.lab1_weight_carton = _int(payload.get("weight_carton"))
        order.lab1_weight_content = _int(payload.get("weight_insert")) or _int(
            payload.get("weight_content")
        )
        order.state = "LABELED" if order.lab1_result else "FAILED"

    elif event_type == "LAB2":
        order.lab2_at = now
        order.lab2_result = 1 if _bool(payload.get("good")) else 0
        order.lab2_weight_scale = _int(payload.get("weight_scale"))
        order.lab2_weight_carton = _int(payload.get("weight_carton"))

    elif event_type == "END":
        order.end_at = now
        order.completed_at = now
        status = _int(payload.get("status"))
        order.end_status = status
        order.end_good = status == 1
        order.final_length_mm = _int(payload.get("sizes_length"))
        order.final_width_mm = _int(payload.get("sizes_width"))
        order.final_height_mm = _int(payload.get("sizes_height"))
        order.final_weight_g = _int(payload.get("weight"))
        order.state = "COMPLETED" if status == 1 else "FAILED"

    elif event_type == "REM":
        order.rem_at = now
        order.state = "DELETED"

    return order, prev_state


def _source_label(code: Any) -> str:
    # Simulator sends source as a numeric code; map to human labels
    mapping = {"0": "Camera", "1": "HandScanner", "2": "Keyboard"}
    if isinstance(code, str) and code in mapping:
        return mapping[code]
    return str(code or "Keyboard")


async def _write_audit(
    db,
    machine: Machine,
    order: OrderState | None,
    event_type: str,
    payload: dict,
    prev_state: str | None,
) -> None:
    new_state = order.state if order else None
    log = AuditLog(
        tenant_id=machine.tenant_id,
        event_type=event_type,
        category=(
            "state_transition"
            if order and prev_state and prev_state != new_state
            else "machine_event"
        ),
        actor_type="machine",
        actor_id=machine.machine_id,
        machine_id=machine.machine_id,
        reference_id=order.reference_id if order else payload.get("reference_id"),
        order_id=order.id if order else None,
        previous_state=prev_state,
        new_state=new_state,
        payload=json.dumps(payload, default=str)[:4000],
        detail=_human_detail(event_type, payload),
    )
    db.add(log)


def _human_detail(event_type: str, payload: dict) -> str:
    """Short, operator-readable summary of the event."""
    ref = payload.get("reference_id", "")
    if event_type == "ENQ":
        barcode = payload.get("barcode", "")
        return f"Barcode {barcode} gescannt" if barcode else "Barcode gescannt"
    if event_type == "IND":
        return f"Paket {ref} hat das Förderband betreten"
    if event_type == "ACK":
        h = payload.get("height_mm", "?")
        l_ = payload.get("length_mm", "?")
        w = payload.get("width_mm", "?")
        ok = "akzeptiert" if _bool(payload.get("good")) else "abgewiesen"
        return f"Paket {ref} vermessen: {l_}×{w}×{h} mm ({ok})"
    if event_type == "INV":
        return f"Rechnung für {ref} gedruckt ({payload.get('num_pages', 1)} Seite/n)"
    if event_type == "LAB1":
        weight = payload.get("weight_scale", "?")
        return f"Etikett 1 für {ref} gedruckt (Gewicht {weight} g)"
    if event_type == "LAB2":
        return f"Zweites Etikett für {ref} gedruckt"
    if event_type == "END":
        ok = "OK" if _int(payload.get("status")) == 1 else "abgewiesen"
        return f"Paket {ref} verlässt die Maschine ({ok})"
    if event_type == "REM":
        return f"Paket {ref} manuell entfernt"
    if event_type == "HBT":
        return "Heartbeat empfangen"
    return f"{event_type} empfangen"
