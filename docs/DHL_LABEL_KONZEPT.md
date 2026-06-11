# Konzept & Stand: DHL-Anbindung (Parcel DE Business Shipment, B2C)

> Status: **Grundgerüst gebaut, LAB1-Trigger noch nicht verdrahtet** · Juni 2026 · Grundlage: `cmc-process-documentation.pdf` §5–6, `Kommunikation CartonWrap.pdf` (CIS External Mode), DHL-Developer-Portal (Parcel DE Shipping v2), aktueller Code-Stand.

## Aktueller Umsetzungsstand

**Backend** (`app/modules/dhl/`)
- Client (`client.py`) gegen `POST {base}/orders` der Parcel-DE-Shipment-API v2, Auth über HTTP-Basic + `dhl-api-key`-Header
- Service (`service.py`) — Label erzeugen + persistieren, idempotent über `order_state_id`
- DB-Tabelle `shipments` (Alembic 0005): Tracking, Empfänger-Snapshot, Maße, Label-Base64 (ZPL2/PDF), `is_test`-Flag
- Runtime-Schalter `dhl_runtime.write_enabled` analog Pulpo (Default Test-Modus, persistiert pro Tenant)
- Endpunkte: `GET /api/v1/settings/dhl/status`, `PUT /api/v1/settings/dhl`, `POST /api/v1/shipments/test-label`
- 6 Tests (Auth-Header, Body-Layout, Mock-im-Test-Modus, Fehlerbehandlung, refNo-Truncation)

**Frontend** — Karte „Versand · DHL Parcel DE" auf der Firma-Einstellungen-Seite: Status, Test-Modus-Toggle, „Test-Label erstellen"-Button, letzter Erfolg/Fehler, DE/EN-Übersetzung

**Settings** (`config.py`) — alle Felder mit sinnvollen Defaults:
- `DHL_BASE_URL` (Default Production-EU), `DHL_API_KEY`, `DHL_USERNAME`, `DHL_PASSWORD`, `DHL_BILLING_NUMBER` (EKP + Verfahren + Teilnahme)
- `DHL_DEFAULT_PRODUCT` (V01PAK = DHL Paket National)
- Absender-Defaults (`DHL_SENDER_NAME`/`_STREET`/`_STREET_NO`/`_ZIP`/`_CITY`/`_COUNTRY`)
- `DHL_LABEL_FORMAT` (ZPL2 für Thermo-Druck am CW1000)

## Was als Nächstes (vor Live-Schaltung) noch fehlt

1. **LAB1-Hook im Gateway** (`connection.py`): bei LAB1 → `create_label_for_order` aufrufen, Tracking + Label-Base64 in die LAB1-Antwort an die Maschine zurückgeben. Wartet auf den Stationsflags-Fix (LAB1 erst aktivieren, wenn die echte Hardware einen Labeler hat).
2. **Empfänger-Adress-Resolver**: aus `pulpo_packing_orders.sales_order_id` die Lieferadresse via Pulpo-API holen (oder Webhook-Payload erweitern). Aktuell wird die Adresse nur am Test-Endpunkt explizit übergeben.
3. **Deferred-Writes-Replay an Pulpo**: nach erfolgreichem `END status=1` Tracking + Label an Pulpo hochladen (`accept → create_box → attach_label → finish → close`) — Skelett existiert in `pulpo/client.py`, ist noch nicht verdrahtet.

## ENV-Variablen, die du in Railway eintragen kannst (parat halten)
```
DHL_API_KEY=…              # aus DHL Developer-Portal
DHL_USERNAME=…             # GK-Portal-Login
DHL_PASSWORD=…
DHL_BILLING_NUMBER=…       # EKP+Verfahren+Teilnahme, z.B. "33333333330102"
DHL_SENDER_NAME=…          # eure Firma
DHL_SENDER_STREET=…
DHL_SENDER_STREET_NO=…
DHL_SENDER_ZIP=…
DHL_SENDER_CITY=…
# DHL_BASE_URL optional — Default = Production EU
```
**Test-Modus bleibt AN**, bis du in den Einstellungen aktiv umschaltest — keine Sendung kostet Geld, bevor du es willst.

Dieses Dokument beschreibt, **wie die Erzeugung echter Versandlabels (DHL u. a.) angebunden wird** — was die maßgebliche Prozess-Doku vorgibt, was heute fehlt, und welche Bausteine/Entscheidungen nötig sind. **Es wird noch nichts gebaut**, bis das Konzept abgenommen ist.

---

## 1. Ziel & Abgrenzung

**Ziel:** Beim Etikettieren (Station LAB1, optional vorab bei IND) ruft unser Backend einen **externen Carrier-Service (DHL)** auf, erzeugt eine **Sendung**, erhält **Tracking-Nummer + Label-PDF**, liefert das Label an die Maschine zum Drucken, und schreibt nach erfolgreichem Ausgang (END) Tracking + Label an Pulpo zurück.

**Nicht im Scope:** eigener Etikettendruck-Stack, eigene Adress-/Tarif-Logik über das hinaus, was DHL liefert. Wir orchestrieren nur: Daten sammeln → DHL aufrufen → Label an Maschine → Pulpo aktualisieren.

---

## 2. Ist-Zustand & Lücken

**Vorhanden (Gerüst):**
- LAB1/LAB2 werden geparst & beantwortet — die Antwort sendet aktuell `label_url: ""` (leer) und nutzt den Scan-Barcode als Match. **Kein echtes Label, keine Tracking-Nummer.**
- `pre_create_labels`-Flag + `label_type` (carrier/template/weclapp) als Schema-Platzhalter.
- Pulpo-Client `create_shipment_tracking` / `attach_label` — hängt eine **bereits existierende** Tracking-Nr./Label an die Pulpo-Box (Deferred-Write-Schritt 3). **Erzeugt nichts bei DHL.**
- `labels/`-Modul ist **leer**.

**Fehlt komplett:**
1. **Carrier-/DHL-Client**: Sendung erzeugen → Tracking-Nr. + Label-PDF.
2. **Label-Auslieferung an die Maschine** im LAB1-Response (Datei/URL + Match-Barcode = Tracking-Nr.).
3. **Pre-Creation an IND** (async) + **Orphan-Handling** bei Ablehnung.
4. **Datenbeschaffung** (Empfängeradresse, Gewicht, Maße) für die DHL-Sendung.
5. **Label-Storage** + Tracking-Persistenz am Auftrag; Deferred-Write an Pulpo bei END.

---

## 3. Soll-Flow (aus der CMC-Prozess-Doku §5–6)

**Label-Quellen (3 Typen):** Carrier (DHL/DPD/FedEx → Tracking-Nr. als Match-Barcode), Template (HTML-PDF), Weclapp-Dokument. Hier relevant: **Carrier/DHL**.

**Standard (an LAB1):**
```
Box am Etikettierer → LAB1 → Backend ruft DHL-API → Label-PDF + Tracking
        → LAB1-Response: Label + Match-Barcode → Maschine druckt/appliziert
        → Ausgang: END verifiziert Match-Barcode (= Tracking-Nr.)
```

**Pre-Creation (an IND, optional, `pre_create_labels: true`):** Label schon bei Induktion async vorerzeugen, um Latenz am Labeler zu sparen; **graceful fallback** auf Standard, wenn nicht rechtzeitig fertig. Pro Carrier abschaltbar (z. B. bei strengen Gewichtsvorgaben, da exaktes Gewicht erst an LAB1 vorliegt).

**Orphan-Handling:** Label vorab erzeugt, Paket dann abgelehnt → **State löschen, Label verwerfen**, Auftrag zurück in die Pulpo-Queue. (Wichtig: Doppelsendung/Kosten vermeiden.)

**Deferred Writes (LAB1→END):** erst bei `END status=1` an Pulpo replayen: `accept → box(+Maße/Gewicht) → label+tracking → finish → close`. Verhindert Teilzustände in Pulpo, wenn die Maschine nach dem Labeln auswirft.

---

## 4. Zu bauende Komponenten

1. **`carriers/`-Modul** (analog `pulpo/`):
   - `dhl_client.py` — Auth + `create_shipment(...) → {tracking_number, label_pdf, label_format}`. Sandbox-/Live-Endpoint per Env.
   - Abstraktion `CarrierClient` (DHL zuerst, DPD/FedEx später andockbar).
2. **Label-Orchestrierung** im Gateway:
   - LAB1: Auftragsdaten holen → DHL aufrufen → Label + Match-Barcode in den LAB1-Response.
   - IND (optional): async Pre-Create (Task/Queue) → Label im Auftrag zwischenspeichern.
3. **Datenquelle Empfänger/Sendung:** aus dem Pulpo-Packing-/Sales-Order (Adresse, Gewicht aus Waage an LAB1, Maße aus 3D an ACK). **Feld-Mapping zu klären.**
4. **Storage:** Label-PDF ablegen (Supabase Storage / Objektspeicher), Tracking-Nr. + Label-Referenz am `OrderState`.
5. **Pulpo-Rückschreibung:** vorhandene Client-Methoden im END-Deferred-Write-Flow nutzen.
6. **Orphan-Cleanup** bei ACK-Reject / EJECT.

---

## 5. 🔒 Sicherheit (kritisch)

Eine DHL-Sendung zu erzeugen ist ein **realer, kostenpflichtiger Vorgang** (echte Sendungsnummer, ggf. echtes Paket). Daher:
- **Eigener Write-/Test-Guard für Carrier-Calls** (analog Pulpo-Write-Guard): im Test-Modus **keine Live-Sendungen** — entweder **DHL-Sandbox** oder kompletter Stub.
- Idempotenz: pro Auftrag/Box nur **eine** Sendung erzeugen (Schutz gegen Doppel-Calls bei Re-Scan/Retry).
- Credentials **nur in Env** (Railway), nie im Repo.

---

## 6. Offene Punkte / benötigte Infos (Blocker)

| # | Frage | Warum |
|---|---|---|
| 1 | **Welches DHL-Produkt/API?** (Parcel DE Shipping v2 · DHL eCommerce · DHL Express MyDHL) + **Sandbox-Credentials** | Endpunkte/Auth/Label-Format hängen davon ab |
| 2 | **Wie liefert der LAB1-Response das Label an die Maschine?** (URL, Base64-PDF, oder Druck über die „Label Printer 1"-Verbindung; Format PDF/ZPL, Größe/DPI) | Steht im **kundenspezifischen CIS-Protokoll** dieser Linie — **von CMC anzufordern**. Die Protokoll-Doku sagt explizit: „defined in the CIS protocol", und die direkte WMS↔Labeler-Kommunikation „must be checked during project phase". |
| 3 | **Empfängeradresse/Sendungsdaten — woher?** Welche Pulpo-(oder Weclapp/SAP-)Felder liefern Name/Adresse/Land/Gewicht? | Pflichtfelder der DHL-Sendung |
| 4 | **Match-Barcode = Tracking-Nr.?** Bestätigen, dass der Ausgangs-Scanner die DHL-Tracking-Nr. als Match prüft | END-Verifikation |
| 5 | **Storage** für Label-PDFs (Supabase Storage?) | Ablage/Abruf |

---

## 7. Umsetzungsschritte (nach Abnahme)

1. DHL-Produkt + Sandbox-Creds festlegen; `carriers/dhl_client.py` gegen Sandbox (mit Tests via MockTransport).
2. LAB1-Response-Format mit CMC klären → Label-Auslieferung implementieren (Standard-Flow zuerst).
3. Datenmapping Empfänger/Gewicht/Maße aus Pulpo.
4. Tracking/Label am `OrderState` + Storage; Deferred-Write an Pulpo bei END.
5. Pre-Creation an IND + Orphan-Handling.
6. Carrier-Write-Guard + Idempotenz + End-to-End-Test im Sandbox.

> **Hinweis Go-Live Maschine:** Für den ersten echten Maschinen-Test wird DHL **nicht** benötigt — LAB läuft auch ohne echtes Label, und im Test-Modus passiert nichts Schreibendes (weder Pulpo noch DHL).
