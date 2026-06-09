"""Pulpo-Endpoints: Webhook-Empfang + Admin-Actions.

Die drei Webhook-Routen sind extra dünn — sie persistieren das
Rohpayload und delegieren ans Service-Modul fürs Mapping. So gehen
unbekannte Felder erstmal nicht verloren und wir können nach dem ersten
echten Pulpo-Push im Audit-Log sehen wie die Daten wirklich aussehen.

Signatur-Prüfung (HMAC) sitzt in `_verify_webhook_signature`. Falls
Pulpo einen Shared-Secret-basierten Mechanismus nutzt: Secret in
`PULPO_WEBHOOK_SECRET` env-var setzen. Wenn das Secret leer ist,
akzeptieren wir alle Requests (sinnvoll für lokale Tests).
"""

from __future__ import annotations

import hmac
import hashlib
import json
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.logging import logger

from . import cw_sync, service

router = APIRouter(prefix="/api/v1/webhooks/pulpo", tags=["pulpo"])


def _verify_webhook_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """HMAC-SHA256-Verifikation. Pulpo schickt vermutlich einen Header
    wie `X-Pulpo-Signature: sha256=<hex>`. Format ggf. anpassen sobald
    wir's bestätigt haben.
    """
    secret = (get_settings().pulpo_webhook_secret or "").encode()
    if not secret:
        # No secret configured — accept (Demo / Local-Dev mode). Logge
        # damit ein vergessenes Secret im Prod auffällt.
        logger.warning("Pulpo webhook received but PULPO_WEBHOOK_SECRET is not set — accepting unverified")
        return True
    if not signature_header:
        return False
    # Trim optional "sha256=" prefix.
    sig = signature_header.split("=", 1)[1] if "=" in signature_header else signature_header
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


@router.post("/packing_order_created", status_code=status.HTTP_200_OK)
async def webhook_packing_order_created(
    request: Request,
    x_pulpo_signature: str | None = Header(default=None),
):
    """Pulpo meldet: eine neue Packing-Order ist verfügbar. Wir spiegeln
    sie in `pulpo_packing_orders` + `pulpo_order_items`, damit die CMC-
    Maschine beim Scan sofort den Order-Match findet ohne Pulpo zu
    befragen.
    """
    raw = await request.body()
    if not _verify_webhook_signature(raw, x_pulpo_signature):
        raise HTTPException(status_code=401, detail="invalid signature")
    payload = _parse_json(raw)
    async for db in get_db():
        result = await service.handle_packing_order_created(db, payload)
        # Queue changed → rebuild affected machines' CW-Listen from the cache.
        await cw_sync.sync_cw_lists_from_cache(db)
        await db.commit()
        return result


@router.post("/packing_order_finished", status_code=status.HTTP_200_OK)
async def webhook_packing_order_finished(
    request: Request,
    x_pulpo_signature: str | None = Header(default=None),
):
    """Pulpo meldet: Order ist fertig (extern erledigt, ggf. manuell).
    Wir markieren sie als „closed" im Cache, damit sie nicht mehr für
    Scans gefunden wird.
    """
    raw = await request.body()
    if not _verify_webhook_signature(raw, x_pulpo_signature):
        raise HTTPException(status_code=401, detail="invalid signature")
    payload = _parse_json(raw)
    async for db in get_db():
        result = await service.handle_packing_order_finished(db, payload)
        # Order left the queue → rebuild CW-Listen so it stops matching.
        await cw_sync.sync_cw_lists_from_cache(db)
        await db.commit()
        return result


@router.post("/box_closed", status_code=status.HTTP_200_OK)
async def webhook_box_closed(
    request: Request,
    x_pulpo_signature: str | None = Header(default=None),
):
    """Pulpo meldet: ein Operator hat manuell verpackt und die Box
    geschlossen. Wir loggen das, damit später (falls die Order parallel
    auf der Maschine läuft) keine Doppel-Labels gedruckt werden.

    Aktuell: nur loggen und persistieren. Die echte Reconcile-Logik aus
    cmc-process-doc § 5 („Manual Pack Race"-Schutz) kommt sobald die
    Pulpo-Felder feststehen.
    """
    raw = await request.body()
    if not _verify_webhook_signature(raw, x_pulpo_signature):
        raise HTTPException(status_code=401, detail="invalid signature")
    payload = _parse_json(raw)
    logger.info(f"Pulpo box_closed received: {payload!r}")
    return {"ok": True, "noted": True}


def _parse_json(raw: bytes) -> dict[str, Any]:
    try:
        return json.loads(raw or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="invalid JSON")
