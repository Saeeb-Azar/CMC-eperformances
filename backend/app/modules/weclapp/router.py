"""Produkt-Stammdaten-Endpoints für die Produktkarten in den CW-Listen.

Auflösung pro EAN in zwei Stufen:
  1. weclapp (wenn konfiguriert): Name, SKU, Beschreibung, Bild.
  2. Fallback Pulpo-Cache: der beim CW-Sync gespeicherte ``product_name``
     aus ``pulpo_order_items`` — so gibt es auch ohne weclapp-Zugang
     zumindest den Produktnamen.

Das Artikelbild wird über das Backend proxied (``/{ean}/image``), weil der
Browser den ``AuthenticationToken``-Header nicht in einem <img>-Tag
mitschicken kann.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import logger
from app.modules.pulpo.models import PulpoOrderItem

from .client import WeclappError, weclapp

router = APIRouter(prefix="/api/v1/products", tags=["products"])


class LookupRequest(BaseModel):
    eans: list[str] = Field(default_factory=list, max_length=200)


async def _pulpo_fallback(db: AsyncSession, ean: str) -> dict | None:
    """Produktname aus dem Pulpo-Queue-Cache (beste verfügbare Quelle ohne
    weclapp). Liefert None, wenn auch Pulpo den EAN nicht kennt."""
    name = (
        await db.execute(
            select(PulpoOrderItem.product_name)
            .where(PulpoOrderItem.ean == ean, PulpoOrderItem.product_name != "")
            .order_by(PulpoOrderItem.id.desc())
            .limit(1)
        )
    ).scalar()
    if not name:
        return None
    return {
        "ean": ean, "article_id": "", "name": str(name), "sku": "",
        "description": "", "unit": "", "has_image": False, "source": "pulpo",
    }


def _with_image_url(p: dict) -> dict:
    p = dict(p)
    p["image_url"] = f"/api/v1/products/{p['ean']}/image" if p.get("has_image") else None
    return p


@router.post("/lookup")
async def lookup_products(body: LookupRequest, db: AsyncSession = Depends(get_db)):
    """Batch-Lookup: {ean: produkt | null}. weclapp zuerst, Pulpo-Cache als
    Fallback; unbekannte Codes (z.B. M-CartBox-Barcodes) → null."""
    out: dict[str, dict | None] = {}
    for raw in body.eans:
        ean = (raw or "").strip()
        if not ean or ean in out:
            continue
        product: dict | None = None
        try:
            product = await weclapp.get_article_by_ean(ean)
        except WeclappError as e:
            # weclapp down/falsch konfiguriert → Fallback, nicht 500.
            logger.warning(f"weclapp lookup {ean} failed: {e}")
        if product is None:
            product = await _pulpo_fallback(db, ean)
        out[ean] = _with_image_url(product) if product else None
    return {"products": out, "weclapp_configured": weclapp.configured}


@router.get("/{ean}/image")
async def product_image(ean: str):
    """Artikelbild-Proxy (weclapp braucht den Auth-Header, <img> kann den
    nicht setzen). 404 wenn unbekannt oder ohne Bild."""
    try:
        product = await weclapp.get_article_by_ean(ean)
        if not product or not product.get("has_image"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no image")
        image = await weclapp.get_article_image(product["article_id"])
    except WeclappError as e:
        logger.warning(f"weclapp image {ean} failed: {e}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no image") from e
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no image")
    content, media_type = image
    # Stammdaten/Bilder ändern sich praktisch nie → der Browser darf cachen.
    return Response(content=content, media_type=media_type,
                    headers={"Cache-Control": "public, max-age=86400"})
