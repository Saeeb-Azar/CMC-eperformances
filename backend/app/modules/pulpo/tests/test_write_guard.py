"""The Test-Modus write guard must block every Pulpo write, but never reads."""

from __future__ import annotations

import asyncio

import httpx

from app.modules.pulpo.client import PulpoClient, PulpoError
from app.modules.pulpo.runtime import pulpo_runtime


def _client(handler):
    return PulpoClient(
        base_url="https://pulpo.test", username="u", password="p",
        transport=httpx.MockTransport(handler),
    )


def _auth_ok(request):
    if request.url.path == "/api/v1/auth":
        return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
    return httpx.Response(200, json={"data": []})


def test_writes_blocked_in_test_mode():
    pulpo_runtime.write_enabled = False  # Test-Modus (default)

    def handler(request):
        if request.url.path != "/api/v1/auth":
            raise AssertionError("a write request reached the network in Test-Modus!")
        return _auth_ok(request)

    client = _client(handler)
    writes = [
        client.accept_packing_order(1),
        client.create_box(1, product_id=2),
        client.update_box(1, 2, weight_g=100),
        client.create_shipment_tracking(1, 2, carrier_code="DHL", tracking_code="X"),
        client.attach_document(1, 2, filename="f", path="p", content_type="application/pdf"),
        client.attach_label(1, 2, carrier_code="DHL", tracking_code="X"),
        client.finish_packing_order(1),
        client.close_packing_order(1, 3),
    ]
    for coro in writes:
        try:
            asyncio.run(coro)
        except PulpoError as e:
            assert "Test-Modus" in str(e)
        else:
            raise AssertionError("expected a write to be blocked in Test-Modus")


def test_reads_work_in_test_mode():
    pulpo_runtime.write_enabled = False
    client = _client(_auth_ok)
    # Reads must NOT be blocked.
    assert asyncio.run(client.list_queue_orders("CW-A")) == []
    assert asyncio.run(client.get_cartbox_by_barcode("M1")) is None


def test_writes_allowed_when_enabled():
    pulpo_runtime.write_enabled = True
    seen = []

    def handler(request):
        if request.url.path == "/api/v1/auth":
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        seen.append(request.url.path)
        return httpx.Response(200, json={"ok": True})

    client = _client(handler)
    try:
        asyncio.run(client.accept_packing_order(1))
        assert seen == ["/api/v1/packing/orders/1/accept"]
    finally:
        pulpo_runtime.write_enabled = False  # restore safe default


if __name__ == "__main__":
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
                import traceback; traceback.print_exc()
                print(f"FAIL {name}: {e!r}")
    pulpo_runtime.write_enabled = False
    sys.exit(1 if failures else 0)
