"""Pulpo WMS integration.

Spiegelt die in cmc-process-doc § 3 + § 5 beschriebene Integration:
- Packing-Orders aus Pulpo werden via Webhook in unseren Cache (DB)
  gespiegelt: `packing_order_created` legt sie an, `packing_order_finished`
  markiert sie als verbraucht.
- Auf ENQ matchen wir gescannten Barcode (EAN für Single-Order, CartBox
  für Multi-Order) gegen den Cache und reservieren die passende Order.
- Während das Paket auf dem Band ist, sammeln wir „deferred writes" —
  die Pulpo-API-Calls die das Order-Lifecycle abschließen — und replayen
  sie erst nach erfolgreichem END (siehe cmc-process-doc § 5).

Stand: Datenmodell + Webhook-Empfänger stehen. Der Pulpo-API-Client
(`client.py`) ist gegen die echte WMS-OpenAPI implementiert (OAuth2 +
alle Lookup-/Deferred-Write-Endpoints, siehe `wms-openapi.json`) und
unit-getestet, aber noch NICHT in den Gateway-/ENQ-/END-Flow eingehängt —
das ist der nächste Schritt.
"""
