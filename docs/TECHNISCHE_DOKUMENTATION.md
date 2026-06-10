# CMC ePerformances — Technische Dokumentation

> Stand: Juni 2026 · Version 0.1 · Ergänzt `docs/PROJECT.md` (Entwickler-Referenz) und `docs/ENTSCHEIDUNGEN.md` (Architektur-Begründungen).

Diese Dokumentation beschreibt **was die Software kann**, **wie sie technisch umgesetzt ist**, **was gebaut wurde** und **in welchen Schritten**.

---

## 1. Überblick

CMC ePerformances ist eine Web-Applikation, die das **CMC CartonWrap CW1000** Verpackungssystem in Echtzeit überwacht und steuert und es an das **Pulpo WMS** (Warehouse Management System) anbindet.

Die Anwendung sitzt zwischen drei Welten:

```
┌──────────────┐   TCP 15001    ┌───────────────────────────┐   HTTPS    ┌──────────────┐
│ CMC CW1000   │◀──────────────▶│  Backend (FastAPI/Railway) │◀─────────▶│ Browser-UI   │
│ (Simulator   │  CIS-Protokoll │  · TCP-Gateway             │  Polling  │ React/Vite   │
│  oder echt)  │  Pipe/STX/ETX  │  · HTTP-API + WebSocket    │   1 Hz    │              │
└──────────────┘                │  · Pulpo-Sync              │           └──────────────┘
                                 └──────────┬────────────────┘
                                            │ HTTPS (OAuth2)
                                            ▼
                                   ┌───────────────────┐
                                   │ Pulpo WMS (eu)     │
                                   │ Packing-Queue,     │
                                   │ Produkte, Webhooks │
                                   └───────────────────┘
```

**Kernfähigkeiten:**

- Nimmt die TCP-Nachrichten der Maschine entgegen, **beantwortet sie latenzkritisch sofort**, und entscheidet pro Scan über Annahme/Ablehnung.
- Streamt jedes Ereignis live ins Dashboard (Paket-Lebenszyklus stationsweise).
- **CW-Listen kommen automatisch aus der Pulpo-Packing-Queue** (read-only) und filtern, welche Artikel die Maschine annimmt.
- **Test-Modus**: liest aus Pulpo, schreibt nichts — Schreibvorgänge sind hart gesperrt, bis bewusst freigeschaltet.
- Visualisiert Ablehnungsgründe, Stationsfortschritt, Durchsatz.
- Protokoll-Bereich für Probleme und erfolgreiche Prozesse.
- Multi-Tenant + rollenbasierte Rechte.

---

## 2. Technologie-Stack

| Schicht | Technologie |
|---|---|
| Backend | Python 3.12, FastAPI, asyncio, SQLAlchemy 2 (async), Alembic, httpx, python-jose (JWT), passlib/bcrypt |
| Datenbank | PostgreSQL (Produktiv, Railway) · SQLite (lokale Demo) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 + eigenes Token/CSS-System, React Router 7, i18next (DE/EN), Recharts, Lucide-Icons |
| Deployment | Railway (Docker-Container, Auto-Deploy auf Push zu `main`), TCP-Proxy für Port 15001 |
| Protokoll | CMC CIS rel 4.0 (Pipe-delimited, STX/ETX-Framing) |

---

## 3. Backend-Architektur

Ein **einziger** FastAPI/asyncio-Prozess bedient HTTP **und** den TCP-Listener — sie teilen In-Memory-State über das Singleton `connection_manager`.

```
backend/app/
├── main.py                 # Lifespan, Top-Level-Endpoints, Hintergrund-Tasks
├── core/
│   ├── config.py           # Settings (env vars)
│   ├── database.py          # Async-Engine + Session-Factory
│   ├── security.py          # JWT + bcrypt
│   ├── permissions.py       # Rollen-Hierarchie + require_role
│   └── logging.py           # JSON-Logger
├── gateway/                 # Maschinen-Kommunikation
│   ├── connection.py        # TCP-Server, ConnectionManager, ActivePackageTracker, CW-Listen
│   ├── parser.py            # Wire-Format-Parsing + Response-Policy (ENQ-Routing)
│   ├── protocol.py          # MessageType-Enum + Dataclasses
│   ├── websocket.py         # Broadcast-Hub + Ringbuffer (Polling-Quelle)
│   └── persistence.py       # Opt-in DB-Upsert (OrderState + AuditLog) + Bootstrap
└── modules/
    ├── auth/ tenants/ machines/ orders/ audit/ analytics/
    ├── cmc_actions/         # Resolve/Retry/Delete
    ├── simulator/           # Test-Verbindung + DNS-Resolver
    └── pulpo/               # WMS-Integration (siehe §6)
```

### 3.1 TCP-Gateway (`gateway/connection.py`)

- **`MachineConnection`** — eine TCP-Verbindung; hält Reader/Writer, Heartbeat, `protocol_id` (z. B. „0001", aus dem ersten Frame extrahiert).
- **`ActivePackageTracker`** — In-Memory-Spiegel der aktiven Pakete pro Maschine; synchron im ENQ-Pfad für Doppel-Scan-Erkennung; bei END `eject_stale_predecessors` (Sequence-based Cleanup).
- **`ConnectionManager`** (Singleton) — verwaltet Sockets, Modi (`multi_only`), CW-Listen, Pending-Ejections.
- **`_read_loop`** je Verbindung: Frame lesen → parsen → Protokoll-ID erkennen → **Antwort sofort senden** (einziger synchroner Schritt, gegen den 2-s-Timeout des Simulators) → danach fire-and-forget Broadcast + (optional) Persistenz; bei END Sequence-based Ejection.

### 3.2 Parser & Response-Policy (`gateway/parser.py`)

- `parse_message` akzeptiert XML/JSON/Pipe-delimited (echte CW1000 = Pipe + STX/ETX). Positionale Feldtabelle pro Nachrichtentyp.
- `build_response` ist die zentrale Policy. **ENQ-Entscheidungsbaum:**
  1. leer/`NOREAD` → `NOREAD-<event>`, result=0
  2. Doppel-Scan (Glitch) → `DUPLICATE-<event>`, result=0
  3. aktive CW-Liste gepflegt, kein Match → `UNKNOWN-<event>`, result=0
  4. `multi_only` + rein numerisch → `SINGLE-REJECT-<event>`, result=0
  5. sonst → `ref<event>`, result=1, item_validated
- `serialize_response` baut Pipe-Bytes mit STX/ETX in maschinengerechter Feldreihenfolge.

### 3.3 Live-Streaming (`gateway/websocket.py`)

- Ringbuffer (Deque, max. 500) mit aufsteigenden IDs → Quelle für HTTP-Polling (`/events/recent?since=<id>`). WebSocket + SSE als Fallback. Polling ist die robusteste Variante hinter dem Railway-Proxy.

### 3.4 Persistenz (`gateway/persistence.py`)

- `persist_event` (opt-in via `EVENTS_PERSIST_ENABLED`): upsert `OrderState` (ein Datensatz je Paket, akkumuliert Stationsdaten) + `AuditLog` (ein Datensatz je Event mit Schweregrad). HBT/STS werden übersprungen.
- `bootstrap_defaults`: Default-Tenant + Admin (`admin@eperformances.de` / `admin123`).

---

## 4. Maschinen-Funktionen (CIS-Protokoll & Lebenszyklus)

### 4.1 Nachrichtentypen
ENQ (Scan), IND (Induction), ACK (3D-Vermessung), INV (Rechnung), LAB1/LAB2 (Etikettierer), END (Exit-Verifier), REM (manuell entfernt), HBT (Heartbeat), STS (Status) — alle werden **geparst und beantwortet**.

### 4.2 State-Lifecycle
`ASSIGNED → INDUCTED → SCANNED → LABELED → COMPLETED` (Erfolg) bzw. `FAILED / EJECTED / DELETED` (terminal). Definiert in `orders/models.py` + `orders/service.py` (`VALID_TRANSITIONS`).

### 4.3 Recovery & Schutzmechanismen
- **Order-Reservation bei ENQ** (inkl. FAILED) → kein Doppel-Versand.
- **Sequence-based Ejection** bei END → ältere, hängengebliebene aktive States werden automatisch auf EJECTED gesetzt (synthetische Events ans UI).
- **500-ms-Glitch-Schutz** gegen Scanner-Doppelablesung.
- **Mid-Flight-Eject** — Operator kann ein Paket vormerken; beim nächsten Gate (ACK/INV/LAB/END) antwortet das Backend mit Reject.

### 4.4 Reject-Kategorien (mit eigenem Ref-Präfix + UI-Label)
`no_read`, `already_active` (Duplicate), `unknown_barcode` (nicht in CW-Liste), `multi_only_mode`, `skipped_by_subsequent_end`, plus dimensions/label-Auswertung.

### 4.5 Maschinen-Modi
- **Multi-Only** — numerische (Single-Order-)Barcodes werden am Scanner abgelehnt.
- **CW-Listen** — siehe §6.3.

---

## 5. Frontend-Architektur

- **Polling-basiert**: jede Sekunde `/api/v1/events/recent?since=<id>`; resumable über die Ring-IDs.
- **Kein State-Framework** — `useState`/`useMemo`/`useEffect`; Datenquelle ist der Poll.
- `lib/packageLifecycle.ts`: `applyEventToStations` + `deriveState` (Events → 6 Stationen → Lifecycle-State).
- **Seiten:** LiveFlow (Dashboard), Simulator, Maschinen, Einstellungen, Protokoll, Login, Control/Settings (Admin).
- **Gemeinsame Styles:** `styles/components/modal.css` (`.modal*`) und `table.css` (`.data-table*`) — eine Quelle für alle Dialoge/Tabellen.
- **i18n** DE/EN (`i18n/de.json`, `en.json`).

---

## 6. Pulpo-WMS-Integration (`modules/pulpo/`)

### 6.1 Client (`client.py`)
- **OAuth2 Password-Flow**: `POST /api/v1/auth` → Bearer-Token, in-memory gecacht, bei Ablauf/401 ein transparenter Re-Auth.
- Robustes `_as_list` (Pulpo verpackt Listen unter `packing_orders`/`products`/`locations`, nicht `data`).
- Methoden: Lookup (`find_packing_orders_by_ean`, `get_cartbox_by_barcode`, `list_queue_orders`, `get_product`, `get_location`, `list_shipping_locations`) + Deferred-Writes (`accept`/`create_box`/`update_box`/`create_shipment_tracking`/`attach_document`/`attach_label`/`finish`/`close`).

### 6.2 Test-Modus / Schreib-Sicherheit (`runtime.py`)
- `pulpo_runtime.write_enabled` (Default **False**). Jede Schreib-Methode ruft `_require_writes()` → wirft sofort, bevor ein Request rausgeht.
- Lesen immer erlaubt. Umschaltbar in den Einstellungen, in `tenant.settings` persistiert, beim Start geladen.

### 6.3 CW-Listen aus der Packing-Queue (`cw_sync.py`)
- Quelle: **Packing-Queue** (`GET /packing/orders?state=queue`).
- Der **Lagerplatz-Code** (CW1/CW6/CW10 = CartonWrap, SACK/Pack = andere) wird über `GET /warehouses/locations/{id}` aus `origin_location_id` aufgelöst.
- **EANs** liegen unter `items[].product.barcodes[]` → daraus werden die scannbaren Barcodes gebaut.
- Eine **CW-Liste pro Lagerplatz**; gefiltert über das **Präfix** `pulpo_pick_location` der Maschine (z. B. „CW" matcht CW%, schließt SACK aus).
- Befüllung: **Webhooks** (`packing_order_created/finished`) + **periodischer Resync** (`CW_SYNC_INTERVAL_S`, Default 30 s) mit **Self-Heal** (Orders, die die Queue verlassen, werden geschlossen).
- Listen sind `source="pulpo"` → im UI read-only.

### 6.4 Webhooks (`router.py`)
- Sammel-Endpoint `POST /api/v1/webhooks/pulpo` (dispatcht nach Event-Typ) + Einzel-Routen.
- **Auth über `?secret=`-Query-Param** (Pulpos Mechanismus, aus den Webhook-Logs verifiziert) gegen `PULPO_WEBHOOK_SECRET`; HMAC-Header als Fallback.

### 6.5 Wichtige Erkenntnisse aus der Live-Verifizierung
- Listen-Antworten unter Ressourcen-Key (`packing_orders`), nicht `data`.
- EANs unter `item.product.barcodes`.
- Lagerplatz nicht im Order-Payload → via `/warehouses/locations/{id}` aufgelöst.
- Webhook-Secret als Query-Param, nicht HMAC-Header.

---

## 7. API-Referenz (Auszug)

```
# Live / Maschine
GET  /api/v1/events/recent?since=<id>&limit=…     Polling-Stream
POST /api/v1/machines/{id}/mode                    Multi-Only setzen/löschen
PUT  /api/v1/machines/{id}/cw-lists/{name}         CW-Liste (Pulpo = read-only für Barcodes)
POST /api/v1/machines/{id}/eject/{ref}             Mid-Flight-Eject
POST /api/v1/runtime/reset                          Live-Ansicht leeren
GET  /api/v1/gateway/status · /health

# Auth / Domain
POST /api/v1/auth/login
GET/POST/PATCH/DELETE /api/v1/machines …           inkl. pulpo_pick_location
GET  /api/v1/orders · /api/v1/audit · /api/v1/analytics/dashboard
POST /api/v1/packages/{ref}/resolve|retry|delete

# Pulpo
POST /api/v1/webhooks/pulpo[?secret=…]             (+ /packing_order_created|finished|box_closed)
GET  /api/v1/settings/pulpo                         { test_mode, write_enabled }
PUT  /api/v1/settings/pulpo  { test_mode }
GET  /api/v1/settings/pulpo/status                  { last_sync_at, open_orders, barcodes, … }
GET  /api/v1/settings/pulpo/debug                   Cache-Snapshot (alle Lagerplätze)
```

---

## 8. Deployment & Konfiguration

**Railway**: 3 Services — CMC DB (Postgres), CMC Backend (Dockerfile, Auto-Deploy `main`), CMC Frontend (Multi-Stage-Build + `serve`). TCP-Port 15001 über Railway-TCP-Proxy.

**Backend-Env:**
```
DATABASE_URL · SECRET_KEY · CORS_ORIGINS · PORT (Railway setzt automatisch)
CMC_TCP_PORT (15001) · EVENTS_PERSIST_ENABLED (Default false)
PULPO_BASE_URL (https://eu.pulpo.co) · PULPO_USERNAME · PULPO_PASSWORD · PULPO_SCOPE (general)
PULPO_WEBHOOK_SECRET · CW_SYNC_INTERVAL_S (30)
```
**Frontend-Env:** `VITE_API_URL` (Backend-URL, zur Laufzeit in `window.__ENV__` injiziert).

> Wichtige Lektion: `PORT` darf nicht manuell überschrieben werden (Postgres-Port 5432 → 502). Der Dockerfile startet uvicorn auch bei fehlgeschlagener Migration (kein stummes 502 mehr).

---

## 9. Was wurde gebaut — Schritte (chronologisch)

1. **Gateway & Protokoll** — TCP-Server, Pipe/STX-ETX-Parser, Response-Serializer, alle CIS-Nachrichten.
2. **Live-Dashboard (LiveFlow)** — Polling, Paket-Aggregation, Stationsfortschritt, Reject-Visualisierung.
3. **Maschinen-Steuerung** — Multi-Only, manuelle CW-Listen, Mid-Flight-Eject, Leeren.
4. **Sequence-based Ejection + Glitch-Schutz + Reservation-Guard.**
5. **Auth/Multi-Tenant/RBAC, Audit, Analytics, Heartbeat-Logging.**
6. **Deployment-Härtung** — Railway, PORT-Fix, Migrations-Entkopplung, Frontend `env.js`.
7. **Pulpo-Fundament** — OAuth2-Client + alle Endpoint-Methoden gegen die echte WMS-OpenAPI, unit-getestet.
8. **Test-Modus** — harter Schreib-Guard, Default sicher, Settings-Schalter.
9. **CW-Listen aus Pulpo** — Webhook + Resync + Self-Heal; Lagerplatz-Auflösung; EAN-Extraktion; CW-Präfix-Filter; eine Liste pro Lagerplatz.
10. **UI-Redesign** — Stat-Karten/Sparklines, sektionierte Modale, Settings-/Maschinen-/Simulator-Seiten, gemeinsame `modal.css`/`table.css`, Navigation (Maschinen/Einstellungen/Protokoll).
11. **CW-Filter im „Filter"-Button** (Optionen aus den realen Aufträgen).
12. **Protokoll-Seite** — Probleme + erfolgreiche Prozesse, filterbar.
13. **Debug-Endpoint** + Live-Verifizierung mit echten Pulpo-Daten.

---

## 10. Tests

- Backend-Unit-Tests (httpx-Mock, In-Memory-SQLite): PulpoClient (Auth/Caching/401/EAN-Match/Deferred-Sequenz), CW-Sync (Aggregation pro Lagerplatz, consumed-Erhalt), Write-Guard (blockt im Test-Modus, erlaubt live).
- Ausführbar ohne pytest-Plugin: `python -m app.modules.pulpo.tests.test_client` etc.
- Frontend: `tsc -b` + `vite build` als Gate.

---

## 11. Bekannte Grenzen / offene Punkte

- **Deferred-Writes-Flow** (Schreiben bei END an Pulpo) ist vorbereitet, aber noch nicht verdrahtet — „Test-Modus aus" hat erst dann Schreib-Wirkung.
- **Persistenz** standardmäßig aus → Protokoll/Orders/Analytics zeigen nur Live-Daten, bis `EVENTS_PERSIST_ENABLED=true`.
- **Multi-Maschinen-KPIs** auf einer Übersichtsseite fehlen noch.
- Exakte Pulpo-Feldnamen sind defensiv gemappt und gegen Live-Daten verifiziert.
