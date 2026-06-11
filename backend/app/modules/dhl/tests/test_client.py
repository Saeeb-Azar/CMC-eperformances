"""DHL-Client: Auth-Header, Request-Layout, Test-Modus-Guard."""

from __future__ import annotations

import httpx
import pytest

from app.modules.dhl.client import Address, DhlClient, DhlError
from app.modules.dhl.runtime import dhl_runtime


@pytest.fixture(autouse=True)
def _reset_runtime():
    prev = dhl_runtime.write_enabled
    yield
    dhl_runtime.write_enabled = prev
    dhl_runtime.last_error = None


def make_client(handler) -> DhlClient:
    return DhlClient(
        base_url="https://api-eu.dhl.com/parcel/de/shipping/v2",
        api_key="K", username="u", password="p", billing_number="33333333330102",
        transport=httpx.MockTransport(handler),
    )


def _recipient() -> Address:
    return Address(
        name="Max Mustermann", street="Musterstr.", street_no="1",
        zip_code="53113", city="Bonn", country="DEU",
    )


@pytest.mark.asyncio
async def test_test_mode_returns_mock_without_network():
    """Solange write_enabled=False, geht KEIN Request raus."""
    def handler(_: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("must not be called in test mode")
    dhl_runtime.write_enabled = False
    c = make_client(handler)
    r = await c.create_shipment(
        recipient=_recipient(), weight_g=500,
        length_mm=200, width_mm=150, height_mm=80, order_ref="ref0001",
    )
    assert r["tracking"].startswith("TEST-")
    assert r["label_b64"] == ""
    assert r["raw"]["test_mode"] is True


@pytest.mark.asyncio
async def test_live_mode_sends_correct_body_and_headers():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["api_key"] = request.headers.get("dhl-api-key")
        seen["body"] = request.read()
        return httpx.Response(200, json={
            "items": [{"shipmentNo": "00340434161094023901",
                       "label": {"b64": "WlBM"}}],
        })

    dhl_runtime.write_enabled = True
    c = make_client(handler)
    r = await c.create_shipment(
        recipient=_recipient(), weight_g=500,
        length_mm=200, width_mm=150, height_mm=80, order_ref="ref0001",
    )
    assert r["tracking"] == "00340434161094023901"
    assert r["label_b64"] == "WlBM"
    # Auth-Header gesetzt (HTTP Basic + dhl-api-key)
    assert seen["auth"].startswith("Basic ")
    assert seen["api_key"] == "K"
    assert "/parcel/de/shipping/v2/orders" in seen["url"]
    import json
    body = json.loads(seen["body"])
    sh = body["shipments"][0]
    assert sh["billingNumber"] == "33333333330102"
    assert sh["product"] == "V01PAK"
    # mm → cm Konvertierung, gerundet
    assert sh["details"]["dim"] == {"uom": "cm", "height": 8, "length": 20, "width": 15}
    assert sh["details"]["weight"] == {"uom": "g", "value": 500}
    assert sh["consignee"]["postalCode"] == "53113"


@pytest.mark.asyncio
async def test_live_mode_unconfigured_raises():
    dhl_runtime.write_enabled = True
    c = DhlClient(
        base_url="", api_key="", username="", password="", billing_number="",
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})),
    )
    with pytest.raises(DhlError, match="not configured"):
        await c.create_shipment(
            recipient=_recipient(), weight_g=500,
            length_mm=200, width_mm=150, height_mm=80, order_ref="ref0001",
        )


@pytest.mark.asyncio
async def test_http_error_raises_and_records_runtime_error():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"title": "Unauthorized"})

    dhl_runtime.write_enabled = True
    c = make_client(handler)
    with pytest.raises(DhlError) as ei:
        await c.create_shipment(
            recipient=_recipient(), weight_g=500,
            length_mm=200, width_mm=150, height_mm=80, order_ref="ref0001",
        )
    assert ei.value.status_code == 401
    assert dhl_runtime.last_error and "401" in dhl_runtime.last_error


@pytest.mark.asyncio
async def test_missing_shipment_no_raises():
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"items": []})

    dhl_runtime.write_enabled = True
    c = make_client(handler)
    with pytest.raises(DhlError, match="shipmentNo"):
        await c.create_shipment(
            recipient=_recipient(), weight_g=500,
            length_mm=200, width_mm=150, height_mm=80, order_ref="ref0001",
        )


@pytest.mark.asyncio
async def test_refno_is_truncated_to_35_chars():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = request.read()
        return httpx.Response(200, json={
            "items": [{"shipmentNo": "X", "label": {"b64": ""}}],
        })

    dhl_runtime.write_enabled = True
    c = make_client(handler)
    long_ref = "ref" + "0" * 50  # 53 Zeichen
    await c.create_shipment(
        recipient=_recipient(), weight_g=500,
        length_mm=200, width_mm=150, height_mm=80, order_ref=long_ref,
    )
    import json
    body = json.loads(seen["body"])
    assert len(body["shipments"][0]["refNo"]) == 35
