"""DHL Parcel DE Business Shipment API-Client (B2C).

Endpoint:    POST {base}/orders            → erzeugt Label, liefert Tracking
Auth:        HTTP Basic (Geschäftskundenportal-Login) + Header ``dhl-api-key``
Doku:        https://developer.dhl.com/api-reference/dhl-parcel-de-shipping

Der Client formt die Request-Payload exakt nach dem v2-Schema:
  { "profile": "STANDARD_GRUPPENPROFIL",
    "shipments": [
      { "product": "V01PAK", "billingNumber": "...",
        "refNo": "<order_ref>",
        "shipper": {...}, "consignee": {...},
        "details": { "dim": {...}, "weight": {...} } }
    ] }

Antwort enthält pro Sendung ``shipmentNo`` (Trackingnummer) und ``label.b64``
(Base64 ZPL2 oder PDF) je nach Accept-Header.

Write-Guard: Solange ``dhl_runtime.write_enabled = False`` (Test-Modus) ist,
verweigert ``create_shipment`` jeden echten Call und gibt eine Mock-Antwort
zurück — analog zum Pulpo-Schreib-Guard. Damit kann die Integration risikolos
verdrahtet/getestet werden, ohne dass DHL-Sendungen entstehen.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import logger

from .runtime import dhl_runtime


class DhlError(Exception):
    """Non-2xx DHL-Antwort oder Netzwerkfehler."""

    def __init__(self, message: str, status_code: int | None = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class Address:
    """Schmaler Adress-Wrapper — pydantic wäre Overkill, der Service baut
    die Dicts ohnehin frisch zusammen."""

    def __init__(
        self, *, name: str, street: str, street_no: str, zip_code: str,
        city: str, country: str = "DEU", email: str = "", phone: str = "",
    ):
        self.name = name
        self.street = street
        self.street_no = street_no
        self.zip_code = zip_code
        self.city = city
        self.country = country
        self.email = email
        self.phone = phone

    def to_dhl_dict(self) -> dict:
        out: dict[str, Any] = {
            "name1": self.name,
            "addressStreet": self.street,
            "addressHouse": self.street_no,
            "postalCode": self.zip_code,
            "city": self.city,
            "country": self.country,
        }
        if self.email:
            out["email"] = self.email
        if self.phone:
            out["phone"] = self.phone
        return out


class DhlClient:
    """Thin async HTTP client für Parcel DE Business Shipment v2.

    ``transport`` (httpx.MockTransport) erlaubt netzfreie Tests.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        username: str | None = None,
        password: str | None = None,
        billing_number: str | None = None,
        *,
        billing_number_international: str | None = None,
        profile: str | None = None,
        api_secret: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 15.0,
    ):
        s = get_settings()
        self.base_url = (base_url if base_url is not None else s.dhl_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else s.dhl_api_key
        self.api_secret = api_secret if api_secret is not None else s.dhl_api_secret
        self.username = username if username is not None else s.dhl_username
        self.password = password if password is not None else s.dhl_password
        self.billing_number = billing_number if billing_number is not None else s.dhl_billing_number
        self.billing_number_international = (
            billing_number_international if billing_number_international is not None
            else s.dhl_billing_number_international
        )
        self.profile = profile if profile is not None else s.dhl_profile
        self._client = httpx.AsyncClient(
            timeout=timeout, transport=transport,
            auth=(self.username, self.password) if self.username and self.password else None,
            headers={"dhl-api-key": self.api_key} if self.api_key else {},
        )

    @property
    def configured(self) -> bool:
        return bool(
            self.base_url and self.api_key and self.username
            and self.password and self.billing_number
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _default_sender(self) -> Address:
        s = get_settings()
        return Address(
            name=s.dhl_sender_name, street=s.dhl_sender_street,
            street_no=s.dhl_sender_street_no, zip_code=s.dhl_sender_zip,
            city=s.dhl_sender_city, country=s.dhl_sender_country,
        )

    # ----- Sendungserstellung ---------------------------------------------

    async def create_shipment(
        self,
        *,
        recipient: Address,
        weight_g: int,
        length_mm: int,
        width_mm: int,
        height_mm: int,
        order_ref: str,
        product: str | None = None,
        sender: Address | None = None,
        label_format: str | None = None,
    ) -> dict:
        """Eine Sendung erstellen → ``{tracking, label_b64, label_format, raw}``.

        Im Test-Modus (Write-Guard) wird ein Mock-Tracking-Code zurückgegeben,
        es geht KEIN Request an DHL — der Aufrufer kann den Flow trotzdem
        verdrahten und Auftrag/Tracking persistieren.
        """
        s = get_settings()
        product = product or s.dhl_default_product
        label_format = (label_format or s.dhl_label_format).upper()
        sender = sender or self._default_sender()

        if dhl_runtime.test_mode:
            tracking = f"TEST-{datetime.utcnow().strftime('%y%m%d%H%M%S')}-{order_ref[:8]}"
            logger.info(
                f"DHL test-mode: skip API call, mock tracking={tracking} "
                f"(product={product}, weight={weight_g}g, dim={length_mm}x{width_mm}x{height_mm}mm)"
            )
            return {
                "tracking": tracking, "label_b64": "", "label_format": label_format,
                "raw": {"test_mode": True, "order_ref": order_ref},
            }

        if not self.configured:
            raise DhlError("DHL client is not configured (missing API key / credentials / billing number)")

        # Abrechnungsnummer je Empfänger-Land: bei DEU die nationale, sonst
        # die INT-Abrechnungsnummer (falls gesetzt — sonst nationale als
        # Fallback, damit nicht-konfigurierte Tenants den Test trotzdem
        # durchbekommen).
        is_international = (recipient.country or "DEU").upper() != "DEU"
        billing_number = (
            self.billing_number_international if is_international and self.billing_number_international
            else self.billing_number
        )
        body = {
            "profile": self.profile or "STANDARD_GRUPPENPROFIL",
            "shipments": [{
                "product": product,
                "billingNumber": billing_number,
                "refNo": order_ref[:35],  # DHL refNo max 35 Zeichen
                "shipper": sender.to_dhl_dict(),
                "consignee": recipient.to_dhl_dict(),
                "details": {
                    # Maschine misst in mm — DHL erwartet cm (gerundet).
                    "dim": {
                        "uom": "cm",
                        "height": max(1, round(height_mm / 10)),
                        "length": max(1, round(length_mm / 10)),
                        "width":  max(1, round(width_mm  / 10)),
                    },
                    "weight": {"uom": "g", "value": max(1, int(weight_g))},
                },
            }],
        }
        # Label-Format Auswahl via Query-Param (printFormat) — der Header
        # Accept entscheidet zusätzlich (default application/json mit b64).
        params = {"includeDocs": "URL", "printFormat": label_format}
        try:
            resp = await self._client.post(f"{self.base_url}/orders", json=body, params=params)
        except httpx.HTTPError as e:
            dhl_runtime.last_error = f"network: {e}"
            dhl_runtime.last_error_at = datetime.utcnow()
            raise DhlError(f"DHL request failed: {e}") from e

        if resp.status_code >= 400:
            try:
                payload = resp.json()
            except Exception:
                payload = resp.text
            msg = f"DHL /orders → HTTP {resp.status_code}"
            dhl_runtime.last_error = f"{msg}: {payload}"
            dhl_runtime.last_error_at = datetime.utcnow()
            raise DhlError(msg, status_code=resp.status_code, payload=payload)

        data = resp.json()
        # v2 Response: items[0].sstats.shipmentNo + label.b64 (oder url).
        items = data.get("items") or []
        first = items[0] if items else {}
        tracking = str(first.get("shipmentNo") or "")
        label = first.get("label") or {}
        label_b64 = str(label.get("b64") or "")
        if not tracking:
            dhl_runtime.last_error = f"DHL response missing shipmentNo: {data}"
            dhl_runtime.last_error_at = datetime.utcnow()
            raise DhlError("DHL response did not include shipmentNo", payload=data)

        dhl_runtime.last_label_at = datetime.utcnow()
        dhl_runtime.last_label_tracking = tracking
        dhl_runtime.last_error = None
        return {
            "tracking": tracking, "label_b64": label_b64,
            "label_format": label_format, "raw": data,
        }


# Modulweiter Default-Client (Settings-basiert), analog pulpo.client.pulpo.
dhl = DhlClient()
