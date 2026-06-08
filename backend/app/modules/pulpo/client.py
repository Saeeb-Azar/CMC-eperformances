"""Pulpo WMS API Client — Scaffolding.

⚠ TODO bevor das produktiv geht:
   1. Echte Endpoint-Pfade einsetzen (aktuell Platzhalter, markiert mit
      `# TODO endpoint:`). Die Pfade kommen aus der Pulpo-API-Doku.
   2. Auth-Header-Format anpassen — aktuell `Authorization: Bearer <KEY>`,
      Pulpo nutzt evtl. ein anderes Schema (API-Key-Header, OAuth, …).
   3. Feldnamen im Mapping (`_extract_*`-Helpers) an Pulpos JSON anpassen.

Die Struktur folgt der cmc-process-doc § 3 (Single/Multi-Order-Lookup)
und § 5 (Deferred-Writes-Sequenz: accept → update_box → attach_label →
finish → close).
"""

from __future__ import annotations

import httpx
from typing import Any

from app.core.config import get_settings
from app.core.logging import logger


class PulpoError(Exception):
    """Wird geworfen wenn Pulpo einen Non-2xx-Status liefert oder die
    Anfrage netzwerk-seitig fehlschlägt. Wer den Client benutzt fängt
    das ab und entscheidet (Retry, Deferred-Write als „failed" markieren,
    Fallback auf Cache, …).
    """
    def __init__(self, message: str, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class PulpoClient:
    """Dünner HTTP-Client für die Pulpo-API.

    Stateless — jede Methode macht einen Request, kein Connection-Pool-
    Mgmt im Code (httpx kümmert sich darum). Auth + Base-URL kommen aus
    den Settings, sodass wir lokal mit einem Mock-Server testen können.
    """

    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        s = get_settings()
        self.base_url = (base_url or s.pulpo_base_url or "").rstrip("/")
        self.api_key = api_key or s.pulpo_api_key or ""

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    def _headers(self) -> dict[str, str]:
        # TODO auth: Pulpo nutzt eventuell `X-Api-Key` oder ein anderes
        # Schema — Doku checken und ggf. anpassen.
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> Any:
        if not self.configured:
            raise PulpoError("Pulpo client not configured (base_url / api_key missing)")
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as http:
                resp = await http.request(method, url, headers=self._headers(), json=json, params=params)
        except httpx.HTTPError as e:
            raise PulpoError(f"Pulpo network error: {e}") from e
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

    # ── Lookup-Pfade (cmc-process-doc § 3) ────────────────────────────

    async def find_packing_orders_by_ean(
        self, ean: str, pick_location: str,
    ) -> list[dict]:
        """Single-Order-Path: alle „queue"-Orders an dieser Location
        deren Items diesen EAN enthalten. Caller wählt FIFO-Aufträger.

        Erwartetes Response-Format laut Doku: Liste von Packing-Order-
        Objekten mit `id`, `items` (jedes mit `ean`), `state`,
        `pick_location`. Wenn Pulpo das anders nennt, hier anpassen.
        """
        # TODO endpoint: vermutlich `/api/v1/packing-orders` mit Query-
        # Parametern wie `?state=queue&ean=...&location=...`. Doku checken.
        params = {"state": "queue", "ean": ean, "location": pick_location}
        result = await self._request("GET", "/api/v1/packing-orders", params=params)
        return result if isinstance(result, list) else result.get("items", []) if isinstance(result, dict) else []

    async def get_cartbox_by_barcode(self, barcode: str) -> dict | None:
        """Multi-Order-Path: CartBox-Lookup. Returns ein Objekt mit
        verlinkter Fulfillment/Sales-Order, die wir dann separat
        auflösen müssen um die zugehörige Packing-Order in „queue"
        zu finden.
        """
        # TODO endpoint: vermutlich `/api/v1/cart-boxes/{barcode}` oder
        # `?barcode=...`. Doku checken.
        try:
            return await self._request("GET", f"/api/v1/cart-boxes/{barcode}")
        except PulpoError as e:
            if e.status_code == 404:
                return None
            raise

    async def get_packing_order_for_fulfillment(self, fulfillment_id: str) -> dict | None:
        """Multi-Order-Path Schritt 2: für eine Fulfillment-Order die
        zugehörige Packing-Order in „queue"-State holen.
        """
        # TODO endpoint
        try:
            return await self._request(
                "GET", "/api/v1/packing-orders",
                params={"fulfillment_id": fulfillment_id, "state": "queue"},
            )
        except PulpoError as e:
            if e.status_code == 404:
                return None
            raise

    # ── Sync (Self-Healing aus cmc-process-doc § 3) ───────────────────

    async def list_queue_orders(self, pick_location: str, *, limit: int = 1000) -> list[dict]:
        """Vollständige Liste der „queue"-Orders an der Location — für
        einen Cache-Resync. Wird vom Sync-Service aufgerufen wenn der
        Cache als stale markiert ist.
        """
        # TODO endpoint
        result = await self._request(
            "GET", "/api/v1/packing-orders",
            params={"state": "queue", "location": pick_location, "limit": limit},
        )
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "items" in result:
            return result["items"]
        return []

    # ── Deferred-Writes-Sequenz (cmc-process-doc § 5) ─────────────────

    async def accept_packing_order(self, order_id: str) -> dict:
        # TODO endpoint
        return await self._request("POST", f"/api/v1/packing-orders/{order_id}/accept")

    async def update_box(
        self, order_id: str,
        *, length_mm: int, width_mm: int, height_mm: int, weight_g: int,
    ) -> dict:
        # TODO endpoint
        return await self._request(
            "POST", f"/api/v1/packing-orders/{order_id}/box",
            json={
                "length_mm": length_mm,
                "width_mm": width_mm,
                "height_mm": height_mm,
                "weight_g": weight_g,
            },
        )

    async def attach_label(
        self, order_id: str, *, tracking_number: str, label_url: str, carrier: str,
    ) -> dict:
        # TODO endpoint
        return await self._request(
            "POST", f"/api/v1/packing-orders/{order_id}/label",
            json={"tracking_number": tracking_number, "label_url": label_url, "carrier": carrier},
        )

    async def finish_packing_order(self, order_id: str) -> dict:
        # TODO endpoint
        return await self._request("POST", f"/api/v1/packing-orders/{order_id}/finish")

    async def close_packing_order(self, order_id: str) -> dict:
        # TODO endpoint
        return await self._request("POST", f"/api/v1/packing-orders/{order_id}/close")


# Singleton-Instanz für die App. Verwendet die Settings beim Import-
# Zeitpunkt. Falls Tests einen Mock-Client einsetzen wollen, einfach
# `from app.modules.pulpo import client; client.pulpo = MockClient(...)`.
pulpo: PulpoClient = PulpoClient()
