# Pulpo Deferred-Write-Modell (cmc-process-doc §5)

## Leitprinzip
Während ein Paket durch die Maschine läuft, wird in Pulpo **nur gelesen**. Alle
Schreibvorgänge werden auf dem `OrderState` gesammelt (*deferred*) und **genau
einmal** bei `END status=1` abgespielt — atomar (per-Order-Lock), idempotent.
Bei **Eject / Reject (zu groß) / REM** passiert in Pulpo **nichts**.

## Lesen während des Bandlaufs (read-only)
- Queue: `GET /packing/orders?state=queue&origin_location_id={loc}` → `PackingOrder`
  (`sequence_number`=PA-Nr, `sales_order_id`, `sales_order_ref`, `items[].product_id`).
- Empfänger: `GET /sales/orders/{sales_order_id}` → `ship_to`
  (`name`, `address.{street,house_nr,zip,city,country}`, `email`, `phone_number`).
- Multi-Order (Barcode `M…`): `GET /picking/cartboxes?barcode={code}`.

## Deferred-Payload (auf `OrderState`)
- Maße L/B/H: `final_*_mm` (END) bzw. `dimension_*_mm` (ACK).
- Gewicht: `final_weight_g` bzw. `lab1_weight_scale`.
- Tracking/Label/Carrier: aus dem beim LAB1 erzeugten `Shipment`.
- `pulpo_order_id`: bereits bei **ENQ** gebunden (Auftragsbindungs-Fix).
- Replay-Status: `pulpo_replay_state` (NONE/PENDING/DONE/FAILED), `pulpo_box_id`,
  `pulpo_replay_error` (Migration 0009).

## Replay bei `END status=1` (`app/modules/pulpo/replay.py`)
Einzelne REST-Calls, **in dieser Reihenfolge** (kein kombinierter Endpunkt):
1. `accept` — `POST /packing/orders/{id}/accept`
2. `box` — `POST /packing/orders/{id}/box` → dann `PUT …/boxes/{box_id}` (Maße/Gewicht)
3. `label` — `POST …/boxes/{box_id}/shipment_tracking` (+ `…/attach`: Label-PDF)
4. `finish` — `POST /packing/orders/{id}/finish`
5. `close` — `POST /packing/orders/{id}/close?shipping_location_id=…`

- **Lock pro `pulpo_order_id`** → kein Doppel-Replay (END + Retry parallel).
- **Idempotenz vor Schritt 3**: `GET …/boxes/{box_id}/shipment_tracking` → kommt
  schon ein `tracking_code`, Label-Schritt überspringen. `box`-Schritt wird über
  `pulpo_box_id` nicht doppelt angelegt.
- Erfolg → `pulpo_replay_state=DONE`, `state=COMPLETED`. Fehler mittendrin →
  `state=FAILED`, **deferred Payload bleibt** (kein Datenverlust).
- **Write-Guard**: solange `pulpo_runtime.write_enabled=False` (Test-Modus) wird
  der Replay **nur simuliert** (geloggt, `DONE`) — KEIN Write an Pulpo.

## Eject / Reject / REM
Keine Pulpo-Writes; der Auftrag bleibt in der Queue (über die State-Maschine
wieder verarbeitbar). FAILED bleibt für die Auftragsbindung reserviert
(verhindert Doppel-Sendung).

## Dashboard-Retry für FAILED
`POST /api/v1/packages/{reference_id}/pulpo-retry` spielt dieselbe Sequenz mit
dem **bereits gespeicherten** Tracking erneut ab — **kein zweiter Carrier-Call**
(Idempotenz überspringt `attach_label`), unter demselben Lock. Erfolg →
`COMPLETED` + als „manuell aufgelöst" markiert.

## Webhooks (Schritt 7)
- `packing_order_created` → Queue-Cache + CW-Listen.
- `packing_order_finished` → aus dem Cache entfernen.
- `box_closed` → **Manual-Pack-Race-Schutz**: existiert ein aktiver Maschinen-
  State (`ASSIGNED/INDUCTED/SCANNED/LABELED`) zur Order → Label-Erzeugung
  überspringen (Maschine macht es). *Reiner Manuell-Pack (Label erzeugen): TODO.*
- Registrierung: `register_webhook(url, allowed_types, method, warehouse_id)`
  → `POST /webhook`.

## ⚠️ Vor dem Scharfschalten: Bodies live verifizieren (422-Fallen)
Die literalen Pflicht-Bodies sind **nicht** aus dieser Umgebung verifizierbar
(keine Pulpo-Creds/Netz). Der Client kodiert eine **Best-Guess-Form**. Vor dem
Live-Betrieb jeden Schritt **einzeln** gegen die echte Instanz prüfen:

| Schritt | Offene Frage |
|---|---|
| `accept` | Body leer ok, oder `owner_id` nötig? |
| `box` create | Felder `product_id/box_number/quantity` form-encoded korrekt? |
| `box` update | Maße über `attributes` (JSON) — oder direkte Felder? |
| `shipment_tracking` | Pflichtfelder `carrier_code/tracking_code` — Statuswert? |
| `attach` | `type="label"` + `path` (Storage-Ref) — Upload-Mechanik? |
| `close` | außer `shipping_location_id` weitere Pflichtfelder? |

Empfehlung: ein Probe-Tool, das die 5 Calls einzeln feuert und Status/422-Body
zurückgibt — dann die Bodies bestätigen und erst danach Live (`write_enabled=True`).

## Tests
- `app/modules/pulpo/tests/test_replay.py`: 5 Calls in Reihenfolge → COMPLETED;
  Test-Modus → 0 Writes; finish-Fehler → FAILED + Payload erhalten; Retry mit
  vorhandenem Tracking → kein `attach_label` → COMPLETED.
- `app/modules/pulpo/tests/test_box_closed.py`: Skip bei aktivem Maschinen-State.
