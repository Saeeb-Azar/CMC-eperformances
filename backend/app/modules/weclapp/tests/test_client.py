"""weclapp-Client: EAN-Lookup, Auth-Header, Caching, Bild-Proxy-Basis."""

from __future__ import annotations

import httpx
import pytest

from app.modules.weclapp import client as weclapp_client
from app.modules.weclapp.client import WeclappClient, WeclappError

ARTICLE = {
    "id": "4711",
    "name": "Hundefutter Adult 2kg",
    "articleNumber": "HF-2000",
    "ean": "4005240002681",
    "shortDescription1": "Trockenfutter für ausgewachsene Hunde",
    "unitName": "Stk",
    "articleImages": [{"id": "img1"}],
}


@pytest.fixture(autouse=True)
def _clear_caches():
    weclapp_client._ARTICLE_CACHE.clear()
    weclapp_client._IMAGE_CACHE.clear()
    yield
    weclapp_client._ARTICLE_CACHE.clear()
    weclapp_client._IMAGE_CACHE.clear()


def make_client(handler) -> WeclappClient:
    return WeclappClient(
        base_url="https://firma.weclapp.com",
        api_key="test-key",
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_lookup_by_ean_normalizes_and_sends_auth_header():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("AuthenticationToken")
        seen["url"] = str(request.url)
        if request.url.params.get("ean-eq") == "4005240002681":
            return httpx.Response(200, json={"result": [ARTICLE]})
        return httpx.Response(200, json={"result": []})

    c = make_client(handler)
    p = await c.get_article_by_ean("4005240002681")
    assert seen["auth"] == "test-key"
    assert "/webapp/api/v1/article" in seen["url"]
    assert p == {
        "ean": "4005240002681", "article_id": "4711",
        "name": "Hundefutter Adult 2kg", "sku": "HF-2000",
        "description": "Trockenfutter für ausgewachsene Hunde",
        "unit": "Stk", "has_image": True, "image_id": "img1",
        "source": "weclapp",
    }


@pytest.mark.asyncio
async def test_base_url_tolerates_api_prefix():
    def handler(request: httpx.Request) -> httpx.Response:
        # Prefix darf nicht doppelt in der URL landen.
        assert "/webapp/api/v1/webapp" not in str(request.url)
        return httpx.Response(200, json={"result": [ARTICLE]})

    c = WeclappClient(
        base_url="https://firma.weclapp.com/webapp/api/v1",
        api_key="k", transport=httpx.MockTransport(handler),
    )
    assert (await c.get_article_by_ean("4005240002681")) is not None


@pytest.mark.asyncio
async def test_articlenumber_fallback_and_miss_cached():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if request.url.params.get("articleNumber-eq") == "HF-2000":
            return httpx.Response(200, json={"result": [ARTICLE]})
        return httpx.Response(200, json={"result": []})

    c = make_client(handler)
    # EAN-Feld leer → Fallback über articleNumber greift.
    p = await c.get_article_by_ean("HF-2000")
    assert p is not None and p["sku"] == "HF-2000"

    # Unbekannter Code: None — und der Miss ist gecacht (keine neuen Calls).
    assert (await c.get_article_by_ean("M319991")) is None
    before = calls["n"]
    assert (await c.get_article_by_ean("M319991")) is None
    assert calls["n"] == before


@pytest.mark.asyncio
async def test_hit_is_cached_across_calls():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"result": [ARTICLE]})

    c = make_client(handler)
    await c.get_article_by_ean("4005240002681")
    await c.get_article_by_ean("4005240002681")
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_unconfigured_returns_none_without_network():
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("must not be called")

    c = WeclappClient(base_url="", api_key="", transport=httpx.MockTransport(handler))
    assert not c.configured
    assert (await c.get_article_by_ean("4005240002681")) is None


@pytest.mark.asyncio
async def test_http_error_raises_weclapp_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    c = make_client(handler)
    with pytest.raises(WeclappError):
        await c.get_article_by_ean("4005240002681")


@pytest.mark.asyncio
async def test_image_download_and_404_cached_as_none():
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "downloadArticleImage" in url:
            if "/article/id/4711/" in url:
                return httpx.Response(200, content=b"\x89PNG", headers={"content-type": "image/png"})
            return httpx.Response(404)
        if "/article/id/9999" in url:  # Detail-Lookup im Fallback
            return httpx.Response(200, json={"id": "9999", "articleImages": []})
        return httpx.Response(200, json={"result": [ARTICLE]})

    c = make_client(handler)
    img = await c.get_article_image("4711", "img1")
    assert img == (b"\x89PNG", "image/png")
    assert (await c.get_article_image("9999")) is None
    # Miss ist gecacht
    assert weclapp_client._IMAGE_CACHE["9999"] is None


@pytest.mark.asyncio
async def test_image_falls_back_to_detail_lookup():
    """Listen-Response ohne articleImages → Bild kommt erst über den
    Detail-Lookup (GET /article/id/{id}) + articleImageId-Param."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        calls.append(url)
        if "downloadArticleImage" in url:
            # Nur der Versuch MIT der richtigen articleImageId liefert ein Bild.
            if request.url.params.get("articleImageId") == "deep42":
                return httpx.Response(200, content=b"JPG", headers={"content-type": "image/jpeg"})
            return httpx.Response(404)
        if "/article/id/4711" in url:
            return httpx.Response(200, json={"id": "4711", "articleImages": [{"id": "deep42"}]})
        return httpx.Response(200, json={"result": []})

    c = make_client(handler)
    img = await c.get_article_image("4711")  # ohne bekannte image_id
    assert img == (b"JPG", "image/jpeg")
    assert any("/article/id/4711" in u and "download" not in u for u in calls)


@pytest.mark.asyncio
async def test_non_image_response_treated_as_missing():
    """200 mit JSON-Body (kein Bild) darf nicht als Bild durchgehen."""
    def handler(request: httpx.Request) -> httpx.Response:
        if "downloadArticleImage" in str(request.url):
            return httpx.Response(200, json={"error": "no image"})
        return httpx.Response(200, json={"id": "4711", "articleImages": []})

    c = make_client(handler)
    assert (await c.get_article_image("4711", "img1")) is None
