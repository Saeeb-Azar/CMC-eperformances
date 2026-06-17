"""Multi-Order: die Empfängeradresse kommt KANONISCH aus dem Verkaufsauftrag
(sales_order.ship_to), NICHT aus einer tief verschachtelten fremden ship_to im
Payload (z.B. fulfillment_order) — sonst wird die falsche Adresse gelabelt
('Florian'-Bug). Single bleibt unverändert (gleiche Auflösung)."""

from __future__ import annotations

import asyncio

import app.modules.pulpo.client as pulpo_client_mod
from app.gateway.connection import ConnectionManager


class _Order:
    def __init__(self, raw):
        self.raw_payload = raw
        self.pulpo_order_id = "11872451"


class _FakePulpo:
    def __init__(self, sales_ship_to):
        self._st = sales_ship_to
        self.get_sales_order_calls = []

    async def get_sales_order(self, sid):
        self.get_sales_order_calls.append(sid)
        return {"id": sid, "ship_to": self._st}

    async def get_packing_order(self, oid):
        return {}


def test_multiorder_uses_canonical_sales_order_ship_to_not_buried():
    cm = ConnectionManager()
    # echte Adresse am Verkaufsauftrag …
    echt = {"name": "Echte Kundin", "phone_number": "030 1",
            "address": {"street": "Realstr", "house_nr": "7", "zip": "10115",
                        "city": "Berlin", "country": "DEU", "email": "k@x.de"}}
    fake = _FakePulpo(echt)
    real = pulpo_client_mod.pulpo
    pulpo_client_mod.pulpo = fake
    try:
        # … aber im Multi-Payload steckt eine FREMDE ship_to tief verschachtelt
        raw = {
            "sales_order_id": 999,
            "sales_order": {"order_num": "NDAT128551"},   # KEIN ship_to (Queue-Order)
            "fulfillment_order": {"ship_to": {"name": "Florian Falsch",
                                              "address": {"street": "Falschweg", "house_nr": "1",
                                                          "zip": "99999", "city": "Nirgendwo",
                                                          "country": "DEU"}}},
        }

        async def run():
            addr = await cm._resolve_pulpo_recipient(None, "t1", "M030974", order=_Order(raw))
            assert addr is not None
            assert addr.name == "Echte Kundin", addr.name      # NICHT 'Florian Falsch'
            assert addr.city == "Berlin"
            assert fake.get_sales_order_calls == [999]         # kanonisch nachgeladen

        asyncio.run(run())
    finally:
        pulpo_client_mod.pulpo = real


def test_local_canonical_ship_to_is_used_without_api():
    cm = ConnectionManager()
    fake = _FakePulpo({})   # get_sales_order würde leer liefern → darf NICHT nötig sein
    real = pulpo_client_mod.pulpo
    pulpo_client_mod.pulpo = fake
    try:
        raw = {
            "sales_order_id": 5,
            "sales_order": {"order_num": "X", "ship_to": {
                "name": "Lokal Kunde",
                "address": {"street": "Lokalstr", "house_nr": "2", "zip": "20095",
                            "city": "Hamburg", "country": "DEU"}}},
        }

        async def run():
            addr = await cm._resolve_pulpo_recipient(None, "t1", "M1", order=_Order(raw))
            assert addr is not None and addr.name == "Lokal Kunde" and addr.city == "Hamburg"
            assert fake.get_sales_order_calls == []   # lokal kanonisch → kein API-Call

        asyncio.run(run())
    finally:
        pulpo_client_mod.pulpo = real


if __name__ == "__main__":  # pragma: no cover
    test_multiorder_uses_canonical_sales_order_ship_to_not_buried()
    test_local_canonical_ship_to_is_used_without_api()
    print("OK")
