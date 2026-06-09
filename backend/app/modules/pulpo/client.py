"""Pulpo WMS API client.

Talks to the Pulpo WMS REST API (OpenAPI: eu.pulpo.co /api/v1/swagger/wms.json).
Endpoints are mapped to the cmc-process-doc flow:

  § 3 (lookup):   find_packing_orders_by_ean → GET /inventory/products?barcode=…
                  + GET /packing/orders?state=queue&origin_location_code=…
                  get_cartbox_by_barcode     → GET /picking/cartboxes?barcode=…
                  get_packing_orders_for_sales_order → GET /packing/orders?sales_order_id=…
  § 5 (deferred): accept  → POST /packing/orders/{id}/accept
                  box     → POST /packing/orders/{id}/box  (+ PUT …/boxes/{box_id})
                  label   → POST …/boxes/{box_id}/shipment_tracking  (+ …/attach)
                  finish  → POST /packing/orders/{id}/finish
                  close   → POST /packing/orders/{id}/close?shipping_location_id=…

Auth is OAuth2 password-flow (POST /api/v1/auth → access_token). The token is
cached in-memory and refreshed shortly before expiry; a 401 transparently
forces one re-auth + retry.

This module is the foundation only — it is NOT yet wired into the gateway/ENQ
or END flow. Nothing here runs until a caller invokes it.
"""

from __future__ import annotations

import asyncio
import json as _json
import time
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import logger

from .runtime import pulpo_runtime

API_PREFIX = "/api/v1"


class PulpoError(Exception):
    """Raised on a non-2xx Pulpo response or a network/auth failure.

    Callers catch this and decide what to do (retry, mark a deferred write as
    failed, fall back to the cache, …).
    """

    def __init__(self, message: str, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class PulpoClient:
    """Thin async HTTP client for the Pulpo WMS API.

    Credentials and base URL come from settings so it can be pointed at a mock
    server in tests. Pass ``transport`` (e.g. ``httpx.MockTransport``) to test
    without a network.
    """

    # Refresh the token this many seconds before it actually expires, so a
    # request never races the expiry boundary.
    TOKEN_REFRESH_MARGIN = 60

    def __init__(
        self,
        base_url: str | None = None,
        username: str | None = None,
        password: str | None = None,
        scope: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 15.0,
    ):
        s = get_settings()
        raw = (base_url or s.pulpo_base_url or "https://eu.pulpo.co").rstrip("/")
        # Tolerate a base_url that already includes the /api/v1 prefix.
        if raw.endswith(API_PREFIX):
            raw = raw[: -len(API_PREFIX)]
        self.base_url = raw
        self.api_base = f"{self.base_url}{API_PREFIX}"
        self.username = username if username is not None else (s.pulpo_username or "")
        self.password = password if password is not None else (s.pulpo_password or "")
        self.scope = scope if scope is not None else (s.pulpo_scope or "general")

        self._transport = transport
        self._timeout = timeout
        self._token: str | None = None
        self._token_expiry: float = 0.0  # time.monotonic() deadline
        self._auth_lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.username and self.password)

    def _client(self) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {"timeout": self._timeout}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    # ── Auth ──────────────────────────────────────────────────────────

    async def _ensure_token(self) -> str:
        # Fast path: a valid cached token.
        if self._token and time.monotonic() < self._token_expiry:
            return self._token
        async with self._auth_lock:
            # Re-check under the lock — another coroutine may have refreshed.
            if self._token and time.monotonic() < self._token_expiry:
                return self._token
            payload = {
                "grant_type": "password",
                "username": self.username,
                "password": self.password,
                "scope": self.scope,
            }
            try:
                async with self._client() as http:
                    resp = await http.post(f"{self.api_base}/auth", json=payload)
            except httpx.HTTPError as e:
                raise PulpoError(f"Pulpo auth network error: {e}") from e
            if resp.status_code >= 400:
                raise PulpoError(
                    f"Pulpo auth -> {resp.status_code}",
                    status_code=resp.status_code,
                    payload=resp.text,
                )
            data = resp.json()
            token = data.get("access_token")
            if not token:
                raise PulpoError("Pulpo auth response missing access_token", payload=data)
            # expires_in is seconds; refresh a little early.
            expires_in = int(data.get("expires_in") or 3600)
            self._token = token
            self._token_expiry = time.monotonic() + max(0, expires_in - self.TOKEN_REFRESH_MARGIN)
            logger.info(f"Pulpo auth ok (token valid ~{expires_in}s)")
            return token

    def _invalidate_token(self) -> None:
        self._token = None
        self._token_expiry = 0.0

    @staticmethod
    def _require_writes() -> None:
        """Hard guard: blocks every write operation while Test-Modus is on.

        Raises BEFORE any request leaves the process, so nothing can ever be
        changed/closed/deleted in Pulpo unless writes are explicitly enabled
        in the settings (pulpo_runtime.write_enabled)."""
        if not pulpo_runtime.write_enabled:
            raise PulpoError(
                "Pulpo write blocked — Test-Modus aktiv (keine Schreibvorgänge an Pulpo)"
            )

    # ── Core request ──────────────────────────────────────────────────

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        data: dict | None = None,
        _retry: bool = True,
    ) -> Any:
        if not self.configured:
            raise PulpoError("Pulpo client not configured (base_url / username / password missing)")
        token = await self._ensure_token()
        url = f"{self.api_base}{path}"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        # Drop None-valued params/data so we don't send empty filters.
        params = {k: v for k, v in params.items() if v is not None} if params else None
        data = {k: v for k, v in data.items() if v is not None} if data else None
        try:
            async with self._client() as http:
                resp = await http.request(
                    method, url, headers=headers, json=json, params=params, data=data
                )
        except httpx.HTTPError as e:
            raise PulpoError(f"Pulpo network error: {e}") from e

        # Token expired/revoked between refresh and use → re-auth once.
        if resp.status_code == 401 and _retry:
            logger.info("Pulpo returned 401 — refreshing token and retrying once")
            self._invalidate_token()
            return await self._request(
                method, path, json=json, params=params, data=data, _retry=False
            )
        if resp.status_code >= 400:
            raise PulpoError(
                f"Pulpo {method} {path} -> {resp.status_code}",
                status_code=resp.status_code,
                payload=resp.text,
            )
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError:
            return resp.text

    @staticmethod
    def _as_list(result: Any) -> list[dict]:
        """Pulpo list endpoints wrap results in {"data": [...]} or
        {"items": [...]}, or sometimes return a bare list. Normalise."""
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            for key in ("data", "items", "results"):
                if isinstance(result.get(key), list):
                    return result[key]
        return []

    # ── Lookup paths (cmc-process-doc § 3) ─────────────────────────────

    async def find_products_by_barcode(self, barcode: str) -> list[dict]:
        """Resolve an EAN/GTIN barcode to product(s). Packing-order items
        only carry ``product_id``, so the single-order scan path must map the
        scanned barcode → product_id first."""
        result = await self._request("GET", "/inventory/products", params={"barcode": barcode})
        return self._as_list(result)

    async def list_queue_orders(self, pick_location: str, *, limit: int = 1000) -> list[dict]:
        """All packing orders in ``queue`` state at a pick location. Used for
        the full cache resync (§ 3 self-heal) and as the basis for EAN matching."""
        result = await self._request(
            "GET", "/packing/orders",
            params={"state": "queue", "origin_location_code": pick_location, "limit": limit},
        )
        return self._as_list(result)

    async def find_packing_orders_by_ean(self, ean: str, pick_location: str) -> list[dict]:
        """Single-order path: queue orders at this location whose items contain
        the scanned EAN. Caller picks the FIFO (oldest) order.

        Pulpo packing items reference ``product_id`` only, so this resolves the
        barcode → product_id(s) first, then filters the queue locally.
        """
        products = await self.find_products_by_barcode(ean)
        product_ids = {p.get("id") for p in products if p.get("id") is not None}
        if not product_ids:
            return []
        orders = await self.list_queue_orders(pick_location)
        matches = []
        for order in orders:
            items = order.get("items") or []
            if any(it.get("product_id") in product_ids for it in items):
                matches.append(order)
        return matches

    async def get_cartbox_by_barcode(self, barcode: str) -> dict | None:
        """Multi-order path: cart-box lookup by its picking label barcode.
        Returns the cart box (with linked ``sales_order_id`` /
        ``fulfillment_order_id``) or None if no match."""
        result = await self._request("GET", "/picking/cartboxes", params={"barcode": barcode})
        boxes = self._as_list(result)
        return boxes[0] if boxes else None

    async def get_packing_orders_for_sales_order(
        self, sales_order_id: int | str, *, state: str | None = "queue",
    ) -> list[dict]:
        """Multi-order path step 2: the packing order(s) for a sales order,
        optionally filtered by state (default ``queue``)."""
        result = await self._request(
            "GET", "/packing/orders",
            params={"sales_order_id": sales_order_id, "state": state},
        )
        return self._as_list(result)

    async def get_packing_order(self, order_id: int | str) -> dict:
        """Full packing order by ID (includes items)."""
        return await self._request("GET", f"/packing/orders/{order_id}")

    async def get_product(self, product_id: int | str) -> dict | None:
        """Product (with its ``barcodes``) by ID. Used to resolve a packing
        item's product_id → EAN during a queue resync, since packing items
        only carry product_id."""
        result = await self._request("GET", "/inventory/products", params={"id": product_id})
        products = self._as_list(result)
        return products[0] if products else None

    async def list_shipping_locations(self, order_id: int | str) -> list[dict]:
        """Valid shipping locations for a packing order — needed for close()."""
        result = await self._request("GET", f"/packing/orders/{order_id}/shipping_locations")
        return self._as_list(result)

    # ── Deferred-writes sequence (cmc-process-doc § 5) ─────────────────

    async def accept_packing_order(self, order_id: int | str) -> Any:
        """Step 1: accept (assign) the packing order."""
        self._require_writes()
        return await self._request("POST", f"/packing/orders/{order_id}/accept")

    async def create_box(
        self, order_id: int | str,
        *, product_id: int | None = None, box_number: int | None = None,
        quantity: int | None = None,
    ) -> dict:
        """Step 2a: create a packing box. Pulpo expects form-encoded fields and
        returns the box (with ``id``)."""
        self._require_writes()
        return await self._request(
            "POST", f"/packing/orders/{order_id}/box",
            data={"product_id": product_id, "box_number": box_number, "quantity": quantity},
        )

    async def update_box(
        self, order_id: int | str, box_id: int | str,
        *, length_mm: int | None = None, width_mm: int | None = None,
        height_mm: int | None = None, weight_g: int | None = None,
        extra_attributes: dict | None = None,
    ) -> Any:
        """Step 2b: update the box. The WMS only allows updating the free-form
        ``attributes`` field on a box, so machine-measured dimensions/weight are
        stored there as JSON (the carrier reads them back from attributes)."""
        self._require_writes()
        attributes: dict[str, Any] = dict(extra_attributes or {})
        if length_mm is not None:
            attributes["length_mm"] = length_mm
        if width_mm is not None:
            attributes["width_mm"] = width_mm
        if height_mm is not None:
            attributes["height_mm"] = height_mm
        if weight_g is not None:
            attributes["weight_g"] = weight_g
        return await self._request(
            "PUT", f"/packing/orders/{order_id}/boxes/{box_id}",
            data={"attributes": _json.dumps(attributes)},
        )

    async def create_shipment_tracking(
        self, order_id: int | str, box_id: int | str,
        *, carrier_code: str, tracking_code: str,
        tracking_url: str | None = None, attributes: dict | None = None,
    ) -> Any:
        """Step 3a: register the carrier tracking number on the box."""
        self._require_writes()
        body: dict[str, Any] = {"carrier_code": carrier_code, "tracking_code": tracking_code}
        if tracking_url is not None:
            body["tracking_url"] = tracking_url
        if attributes is not None:
            body["attributes"] = _json.dumps(attributes)
        return await self._request(
            "POST", f"/packing/orders/{order_id}/boxes/{box_id}/shipment_tracking",
            json=body,
        )

    async def attach_document(
        self, order_id: int | str, box_id: int | str,
        *, filename: str, path: str, content_type: str, type_: str | None = None,
    ) -> Any:
        """Step 3b: attach the label PDF (already uploaded to storage; ``path``
        is the storage reference) to the box."""
        self._require_writes()
        body: dict[str, Any] = {
            "filename": filename, "path": path, "content_type": content_type,
        }
        if type_ is not None:
            body["type"] = type_
        return await self._request(
            "POST", f"/packing/orders/{order_id}/boxes/{box_id}/attach", json=body,
        )

    async def attach_label(
        self, order_id: int | str, box_id: int | str,
        *, carrier_code: str, tracking_code: str, tracking_url: str | None = None,
        label_filename: str | None = None, label_path: str | None = None,
        label_content_type: str = "application/pdf",
    ) -> dict:
        """Step 3: attach the shipping label to a box — tracking number first,
        then the label document if a stored ``label_path`` is provided.

        Returns {"tracking": ..., "attachment": ...} so the caller can record
        both results in the deferred-write log."""
        self._require_writes()
        tracking = await self.create_shipment_tracking(
            order_id, box_id,
            carrier_code=carrier_code, tracking_code=tracking_code, tracking_url=tracking_url,
        )
        attachment = None
        if label_path:
            attachment = await self.attach_document(
                order_id, box_id,
                filename=label_filename or f"{tracking_code}.pdf",
                path=label_path, content_type=label_content_type, type_="label",
            )
        return {"tracking": tracking, "attachment": attachment}

    async def finish_packing_order(self, order_id: int | str) -> Any:
        """Step 4: finish the packing order."""
        self._require_writes()
        return await self._request("POST", f"/packing/orders/{order_id}/finish")

    async def close_packing_order(self, order_id: int | str, shipping_location_id: int | str) -> Any:
        """Step 5: close the packing order at the given shipping location."""
        self._require_writes()
        return await self._request(
            "POST", f"/packing/orders/{order_id}/close",
            params={"shipping_location_id": shipping_location_id},
        )


# Singleton for the app. Reads settings at import time. Tests can swap it:
#   from app.modules.pulpo import client; client.pulpo = PulpoClient(transport=...)
pulpo: PulpoClient = PulpoClient()
