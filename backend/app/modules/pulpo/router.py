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
    """HMAC-SHA256-Verifikation (Fallback). Pulpo nutzt primär ein
    `?secret=`-Query-Param (siehe `_authorize_webhook`); dieser Header-Weg
    bleibt als Fallback erhalten.
    """
    secret = (get_settings().pulpo_webhook_secret or "").encode()
    if not secret:
        logger.warning("Pulpo webhook received but PULPO_WEBHOOK_SECRET is not set — accepting unverified")
        return True
    if not signature_header:
        return False
    sig = signature_header.split("=", 1)[1] if "=" in signature_header else signature_header
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _authorize_webhook(request: Request, raw_body: bytes, signature_header: str | None) -> bool:
    """Authorize an incoming Pulpo webhook.

    Pulpo's mechanism (confirmed from the webhook logs) is a `?secret=...`
    query parameter appended to the webhook URL. We compare it to
    PULPO_WEBHOOK_SECRET; if that's unset we accept (demo/local). An HMAC
    signature header is still accepted as a fallback.
    """
    secret = (get_settings().pulpo_webhook_secret or "")
    if not secret:
        logger.warning("Pulpo webhook received but PULPO_WEBHOOK_SECRET is not set — accepting unverified")
        return True
    provided = request.query_params.get("secret") or ""
    if provided and hmac.compare_digest(provided, secret):
        return True
    return _verify_webhook_signature(raw_body, signature_header)



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


def _detect_event_type(payload: dict, headers) -> str:
    """Figure out which Pulpo event this is. Pulpo bundles several types onto
    one webhook URL, so the type comes either in a header or a payload field.
    Defensive — tries the common spellings."""
    for h in ("x-pulpo-event", "x-pulpo-topic", "x-pulpo-type", "x-event-type", "x-webhook-event"):
        v = headers.get(h)
        if v:
            return str(v).lower()
    if isinstance(payload, dict):
        for k in ("type", "event", "event_type", "topic", "action", "name", "webhook_type"):
            v = payload.get(k)
            if isinstance(v, str) and v:
                return v.lower()
    return ""


@router.post("", status_code=status.HTTP_200_OK)
@router.post("/", status_code=status.HTTP_200_OK)
async def webhook_dispatch(
    request: Request,
    x_pulpo_signature: str | None = Header(default=None),
):
    """Unified Pulpo webhook entry point.

    Pulpo bundles several event types onto a single webhook URL, so point ONE
    Pulpo webhook here (with the packing_order_created / packing_order_finished
    types) and this reads the event type and dispatches. The per-type routes
    below still work for setups that prefer one webhook per type.
    """
    raw = await request.body()
    if not _authorize_webhook(request, raw, x_pulpo_signature):
        raise HTTPException(status_code=401, detail="invalid secret")
    payload = _parse_json(raw)
    event = _detect_event_type(payload, request.headers)
    # Log the first real deliveries verbatim (capped) so we can confirm the
    # actual event-type field, headers and payload shape, then refine mapping.
    logger.info(
        f"Pulpo webhook event={event!r} "
        f"headers={ {k: v for k, v in request.headers.items() if k.lower().startswith(('x-', 'content-type'))} } "
        f"payload={str(payload)[:2000]}"
    )
    async for db in get_db():
        if "packing_order_created" in event:
            result = await service.handle_packing_order_created(db, payload)
            await cw_sync.sync_cw_lists_from_cache(db)
        elif "packing_order_finished" in event:
            result = await service.handle_packing_order_finished(db, payload)
            await cw_sync.sync_cw_lists_from_cache(db)
        elif "box_closed" in event:  # covers box_closed / packing_box_closed
            result = {"ok": True, "noted": True, "event": event}
        else:
            result = {"ok": True, "ignored": True, "event": event or "unknown"}
        await db.commit()
        return result

