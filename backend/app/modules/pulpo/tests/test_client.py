"""Unit tests for PulpoClient against a mocked Pulpo API (no network).

Uses httpx.MockTransport so no real Pulpo connection is made. Tests are plain
sync functions driving the async client via asyncio.run(), so they run under
pytest without needing pytest-asyncio (and can be executed directly:
``python -m app.modules.pulpo.tests.test_client``).
"""

from __future__ import annotations

import asyncio
import json

import httpx

from app.modules.pulpo.client import PulpoClient, PulpoError


def _make_client(handler, **kw) -> PulpoClient:
    return PulpoClient(
        base_url="https://pulpo.test",
        username="u", password="p", scope="general",
        transport=httpx.MockTransport(handler), **kw,
    )


def _auth_response() -> httpx.Response:
    return httpx.Response(200, json={
        "access_token": "tok-123", "token_type": "Bearer",
        "expires_in": 3600, "scope": "general",
    })


def test_auth_token_is_cached_across_requests():
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(f"{request.method} {request.url.path}")
        if request.url.path == "/api/v1/auth":
            assert json.loads(request.content)["grant_type"] == "password"
            return _auth_response()
        # all other requests must carry the bearer token
        assert request.headers["Authorization"] == "Bearer tok-123"
        return httpx.Response(200, json={"data": []})

    client = _make_client(handler)

    async def run():
        await client.list_queue_orders("LOC1")
        await client.list_queue_orders("LOC1")

    asyncio.run(run())
    # Auth fetched exactly once, reused for both list calls.
    assert calls.count("POST /api/v1/auth") == 1
    assert calls.count("GET /api/v1/packing/orders") == 2


def test_401_triggers_reauth_and_one_retry():
    state = {"auth_count": 0, "served_401": False}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth":
            state["auth_count"] += 1
            return _auth_response()
        if not state["served_401"]:
            state["served_401"] = True
            return httpx.Response(401, text="expired")
        return httpx.Response(200, json={"data": [{"id": 7}]})

    client = _make_client(handler)
    result = asyncio.run(client.list_queue_orders("LOC1"))
    assert result == [{"id": 7}]
    # Initial auth + one re-auth after the 401.
    assert state["auth_count"] == 2


def test_find_packing_orders_by_ean_resolves_product_then_filters_queue():
    def handler(request: httpx.Request) -> httpx.Response:
        p = request.url.path
        if p == "/api/v1/auth":
            return _auth_response()
        if p == "/api/v1/inventory/products":
            assert request.url.params["barcode"] == "4052400033054"
            return httpx.Response(200, json={"data": [{"id": 555, "barcodes": ["4052400033054"]}]})
        if p == "/api/v1/packing/orders":
            assert request.url.params["state"] == "queue"
            assert request.url.params["origin_location_code"] == "CW-A"
            return httpx.Response(200, json={"data": [
                {"id": 1, "items": [{"product_id": 999}]},          # no match
                {"id": 2, "items": [{"product_id": 555}]},          # match
            ]})
        return httpx.Response(404)

    client = _make_client(handler)
    matches = asyncio.run(client.find_packing_orders_by_ean("4052400033054", "CW-A"))
    assert [o["id"] for o in matches] == [2]


def test_find_by_ean_returns_empty_when_product_unknown():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth":
            return _auth_response()
        if request.url.path == "/api/v1/inventory/products":
            return httpx.Response(200, json={"data": []})
        raise AssertionError("packing/orders should not be queried when no product matched")

    client = _make_client(handler)
    assert asyncio.run(client.find_packing_orders_by_ean("000", "CW-A")) == []


def test_cartbox_lookup_returns_first_or_none():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth":
            return _auth_response()
        bc = request.url.params.get("barcode")
        if bc == "M319991":
            return httpx.Response(200, json={"data": [{"id": 42, "sales_order_id": 7}]})
        return httpx.Response(200, json={"data": []})

    client = _make_client(handler)
    assert asyncio.run(client.get_cartbox_by_barcode("M319991"))["sales_order_id"] == 7
    assert asyncio.run(client.get_cartbox_by_barcode("NOPE")) is None


def test_deferred_write_sequence_hits_expected_endpoints():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        p, m = request.url.path, request.method
        if p == "/api/v1/auth":
            return _auth_response()
        seen.append(f"{m} {p}")
        if p.endswith("/box"):
            return httpx.Response(201, json={"id": 88})  # created box
        return httpx.Response(200, json={"ok": True})

    client = _make_client(handler)

    async def run():
        await client.accept_packing_order(10)
        box = await client.create_box(10, product_id=555, quantity=1)
        await client.update_box(10, box["id"], length_mm=200, width_mm=150, height_mm=80, weight_g=250)
        await client.attach_label(
            10, box["id"], carrier_code="DHL", tracking_code="JJD000",
            label_path="s3://bucket/JJD000.pdf",
        )
        await client.finish_packing_order(10)
        await client.close_packing_order(10, shipping_location_id=3)

    asyncio.run(run())
    assert seen == [
        "POST /api/v1/packing/orders/10/accept",
        "POST /api/v1/packing/orders/10/box",
        "PUT /api/v1/packing/orders/10/boxes/88",
        "POST /api/v1/packing/orders/10/boxes/88/shipment_tracking",
        "POST /api/v1/packing/orders/10/boxes/88/attach",
        "POST /api/v1/packing/orders/10/finish",
        "POST /api/v1/packing/orders/10/close",
    ]


def test_update_box_encodes_dimensions_as_json_attributes():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth":
            return _auth_response()
        # form-encoded body
        captured["body"] = dict(httpx.QueryParams(request.content.decode()))
        return httpx.Response(200, json={"ok": True})

    client = _make_client(handler)
    asyncio.run(client.update_box(10, 88, length_mm=200, weight_g=250))
    attrs = json.loads(captured["body"]["attributes"])
    assert attrs == {"length_mm": 200, "weight_g": 250}


def test_close_passes_shipping_location_id():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/auth":
            return _auth_response()
        captured["params"] = dict(request.url.params)
        return httpx.Response(200)

    client = _make_client(handler)
    asyncio.run(client.close_packing_order(10, shipping_location_id=3))
    assert captured["params"]["shipping_location_id"] == "3"


def test_unconfigured_client_raises():
    client = PulpoClient(base_url="https://pulpo.test", username="", password="")
    try:
        asyncio.run(client.list_queue_orders("LOC1"))
    except PulpoError as e:
        assert "not configured" in str(e)
    else:
        raise AssertionError("expected PulpoError for unconfigured client")


def test_base_url_with_api_v1_suffix_is_normalised():
    client = PulpoClient(base_url="https://eu.pulpo.co/api/v1", username="u", password="p")
    assert client.base_url == "https://eu.pulpo.co"
    assert client.api_base == "https://eu.pulpo.co/api/v1"


if __name__ == "__main__":
    # Allow running without pytest: execute every test_* function.
    import inspect, sys
    mod = sys.modules[__name__]
    failures = 0
    for name, fn in sorted(inspect.getmembers(mod, inspect.isfunction)):
        if name.startswith("test_"):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failures += 1
                print(f"FAIL {name}: {e!r}")
    sys.exit(1 if failures else 0)
