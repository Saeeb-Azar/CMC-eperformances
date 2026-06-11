"""weclapp ERP API client — read-only Produkt-Stammdaten per EAN.

Liefert die Daten für die Produktkarten in den CW-Listen: Name, SKU
(Artikelnummer), Beschreibung und das Artikelbild. Es wird NIE in weclapp
geschrieben.

weclapp-API (https://www.weclapp.com/api/):
  - Base:  https://{instanz}.weclapp.com/webapp/api/v1
  - Auth:  Header ``AuthenticationToken: <api-key>``
  - Suche: GET /article?ean-eq={ean}   →  {"result": [ {...article...} ]}
  - Bild:  GET /article/id/{id}/downloadArticleImage  → Binärdaten

Artikel werden cross-run gecacht (Stammdaten ändern sich praktisch nie);
auch "nicht gefunden" wird gecacht, damit unbekannte Codes (z.B. M-CartBox-
Barcodes) nicht bei jedem Modal-Öffnen einen API-Call kosten.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import logger

API_PREFIX = "/webapp/api/v1"

# Cross-run caches: EAN → normalisiertes Produkt (None = in weclapp nicht
# gefunden) und Artikel-ID → (Bild-Bytes, Content-Type) (None = kein Bild).
_ARTICLE_CACHE: dict[str, dict | None] = {}
_IMAGE_CACHE: dict[str, tuple[bytes, str] | None] = {}
_IMAGE_CACHE_MAX = 256  # Bilder sind die einzigen großen Einträge — deckeln.


class WeclappError(Exception):
    """Non-2xx weclapp response or network failure."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class WeclappClient:
    """Thin async HTTP client for the weclapp REST API.

    Credentials come from settings; pass ``transport`` (httpx.MockTransport)
    to test without a network.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 10.0,
    ):
        s = get_settings()
        raw = (base_url if base_url is not None else s.weclapp_base_url).rstrip("/")
        # Tolerate a base_url that already includes the API prefix.
        if raw.endswith(API_PREFIX):
            raw = raw[: -len(API_PREFIX)]
        self.base_url = raw
        self.api_key = api_key if api_key is not None else s.weclapp_api_key
        self._client = httpx.AsyncClient(
            timeout=timeout,
            transport=transport,
            headers={"AuthenticationToken": self.api_key} if self.api_key else {},
        )

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    async def _get(self, path: str, params: dict | None = None) -> httpx.Response:
        url = f"{self.base_url}{API_PREFIX}{path}"
        try:
            resp = await self._client.get(url, params=params)
        except httpx.HTTPError as e:
            raise WeclappError(f"weclapp request failed: {e}") from e
        if resp.status_code >= 400:
            raise WeclappError(
                f"weclapp {path} → HTTP {resp.status_code}", status_code=resp.status_code
            )
        return resp

    # ----- Artikel ----------------------------------------------------

    async def get_article_by_ean(self, ean: str) -> dict | None:
        """Normalized article for an EAN, or None if weclapp doesn't know it.

        Tries the ``ean`` field first, then ``articleNumber`` as fallback
        (some tenants keep the GTIN in the article number). Cached cross-run,
        misses included."""
        ean = (ean or "").strip()
        if not ean:
            return None
        if ean in _ARTICLE_CACHE:
            return _ARTICLE_CACHE[ean]
        if not self.configured:
            return None

        article: dict[str, Any] | None = None
        for field in ("ean", "articleNumber"):
            resp = await self._get("/article", params={f"{field}-eq": ean, "pageSize": 3})
            results = (resp.json() or {}).get("result") or []
            if results:
                article = results[0]
                break

        normalized = self._normalize(article, ean) if article else None
        _ARTICLE_CACHE[ean] = normalized
        return normalized

    @staticmethod
    def _normalize(a: dict, ean: str) -> dict:
        images = a.get("articleImages") or []
        first_image_id = ""
        if images and isinstance(images[0], dict):
            first_image_id = str(images[0].get("id") or "")
        return {
            "ean": ean,
            "article_id": str(a.get("id") or ""),
            "name": str(a.get("name") or ""),
            "sku": str(a.get("articleNumber") or ""),
            "description": str(
                a.get("shortDescription1") or a.get("description") or ""
            )[:500],
            "unit": str(a.get("unitName") or ""),
            # Die LISTEN-Response von weclapp lässt articleImages teils weg —
            # has_image=False heißt also nur "nicht in dieser Response", nicht
            # "hat kein Bild". Der Bild-Proxy probiert es trotzdem.
            "has_image": bool(images),
            "image_id": first_image_id,
            "source": "weclapp",
        }

    # ----- Bild -------------------------------------------------------

    async def _try_download_image(self, article_id: str, image_id: str = "") -> tuple[bytes, str] | None:
        """Ein Download-Versuch; None bei 404/Nicht-Bild-Antwort."""
        params = {"articleImageId": image_id} if image_id else None
        try:
            resp = await self._get(f"/article/id/{article_id}/downloadArticleImage", params=params)
        except WeclappError as e:
            if e.status_code not in (400, 404):
                logger.warning(f"weclapp image {article_id} (img={image_id or '-'}) failed: {e}")
            return None
        ctype = resp.headers.get("content-type", "")
        if not resp.content or not ctype.startswith("image/"):
            return None
        return (resp.content, ctype)

    async def get_article_image(self, article_id: str, image_id: str = "") -> tuple[bytes, str] | None:
        """(bytes, content_type) of the article's primary image, or None.

        Robust gegen die Eigenheiten der weclapp-API: erst Download mit der
        bekannten ``articleImageId``, dann ohne Param (Primärbild), zuletzt
        Artikel-Detail laden (die Listen-Response lässt ``articleImages``
        teils weg) und mit dessen erster Bild-ID erneut versuchen.
        Cached cross-run mit Size-Cap."""
        article_id = (article_id or "").strip()
        if not article_id or not self.configured:
            return None
        if article_id in _IMAGE_CACHE:
            return _IMAGE_CACHE[article_id]

        result = None
        if image_id:
            result = await self._try_download_image(article_id, image_id)
        if result is None:
            result = await self._try_download_image(article_id)
        if result is None:
            # Detail-Lookup: GET /article/id/{id} liefert articleImages voll.
            try:
                detail = (await self._get(f"/article/id/{article_id}")).json() or {}
                images = detail.get("articleImages") or []
                detail_image_id = str(images[0].get("id") or "") if images and isinstance(images[0], dict) else ""
                if detail_image_id and detail_image_id != image_id:
                    result = await self._try_download_image(article_id, detail_image_id)
            except WeclappError as e:
                logger.warning(f"weclapp article detail {article_id} failed: {e}")

        if len(_IMAGE_CACHE) >= _IMAGE_CACHE_MAX:
            _IMAGE_CACHE.pop(next(iter(_IMAGE_CACHE)))
        _IMAGE_CACHE[article_id] = result
        return result

    async def aclose(self) -> None:
        await self._client.aclose()


# Modulweiter Default-Client (Settings-basiert) — analog zu pulpo.client.pulpo.
weclapp = WeclappClient()
