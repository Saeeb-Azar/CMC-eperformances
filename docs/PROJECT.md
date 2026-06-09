# CMC ePerformances — Projekt-Dokumentation

Eine ausführliche Beschreibung des aktuellen Stands: was wir gebaut haben, wie die einzelnen Teile heißen, wo sie liegen, und wie sie zusammenspielen. Geschrieben als Referenz für Entwickler, die in den Code einsteigen oder an einzelnen Stellen weiterbauen.

---

## 1. Was ist das Projekt?

Eine Webapp, die das CMC CartonWrap CW1000 Verpackungssystem in Echtzeit überwacht und steuert. Die Anwendung sitzt zwischen einer physischen (oder simulierten) Verpackungsmaschine und einem Browser-Dashboard. Sie

- nimmt die TCP-Nachrichten der Maschine entgegen, beantwortet sie sofort, und entscheidet pro Scan, ob die Maschine das Paket annehmen oder rauswerfen soll,
- streamt jedes Ereignis live ans Browser-Dashboard, in dem Operatoren den Status jedes Pakets stationsweise sehen,
- lässt Operatoren Maschinen-spezifische Regeln zur Laufzeit setzen (z.B. Multi-Only-Modus, CW-Liste mit erwarteten Barcodes),
- visualisiert Reject-Ursachen direkt in der UI, damit klar wird warum ein Paket abgewiesen wurde,
- hat eine separate Admin-Ebene für Tenants, Benutzer, Rollen und Wartungszustände.

Demo-Setup läuft auf Railway: Backend als FastAPI-Container, Frontend als Vite-Build hinter `serve`, beide deployen automatisch beim Push auf `main`.

---

## 2. Architektur im Großen

```
┌────────────────┐         ┌──────────────────────────────┐         ┌────────────────┐
│ Browser        │         │ Backend (FastAPI auf Railway)│         │ CMC Simulator  │
│                │ HTTPS   │                              │ TCP     │ (CW1000 CIS    │
│ React + Vite   │◀───────▶│  HTTP-Endpoints              │◀───────▶│  rel 4.0)      │
│                │  poll   │  TCP-Gateway                 │  port   │                │
│ LiveFlowPage   │  1Hz    │  WebSocket / SSE / Ring-Buf  │  15001  │ oder echte CW  │
└────────────────┘         └──────────────────────────────┘         └────────────────┘
```

Drei Besonderheiten unseres Setups:

1. **Ein Prozess macht beides.** Das Backend bedient HTTPS für den Browser und einen TCP-Listener für die Maschine im selben FastAPI/asyncio-Eventloop. Die beiden Welten teilen sich In-Memory-State (Singleton `connection_manager`).

2. **Persistenz ist standardmäßig aus.** Events leben nur im In-Memory-Ringbuffer (max. 500 Stück). Wenn das Backend redeployed wird, ist die Live-Ansicht leer bis neue Events reinkommen. Schalter dafür: `EVENTS_PERSIST_ENABLED` in den Settings. Es gibt ein Reset-Skript (`backend/scripts/reset_events.py`), das bereits geschriebene Zeilen wegräumt.

3. **Das Frontend pollt.** Statt WebSocket-Verbindung (die hinter Railways Proxy gerne mal stirbt) fragt die UI jede Sekunde `/api/v1/events/recent?since=<id>` ab und bekommt die neuen Events seit der letzten Abfrage. WebSocket und SSE sind als Fallback vorhanden, aber Polling ist die robusteste Variante.

---

## 3. Backend (`backend/`)

### 3.1 Datei-Hierarchie

```
backend/
├── alembic/                # DB-Migrationen (nur bei aktiver Persistenz relevant)
├── app/
│   ├── main.py             # FastAPI-Setup, Lifespan, Top-Level-Endpoints
│   ├── core/               # Querschnittsthemen
│   │   ├── config.py       # Settings (env vars)
│   │   ├── database.py     # AsyncSession-Factory
│   │   ├── logging.py      # JSON-Logger
│   │   ├── permissions.py  # Rollen-Enum + Dependency-Injection-Guards
│   │   ├── security.py     # JWT + bcrypt
│   │   └── exceptions.py   # HTTP-Fehler-Subklassen
│   ├── gateway/            # Maschinen-Kommunikation
│   │   ├── connection.py   # TCP-Server, ConnectionManager, ActivePackageTracker
│   │   ├── parser.py       # Wire-Format-Parser + Response-Builder
│   │   ├── protocol.py     # MessageType-Enum + Dataclasses
│   │   ├── handler.py      # Dispatch-Decorator (Legacy, kaum genutzt)
│   │   ├── websocket.py    # Broadcast-Hub + Ringbuffer für Polling-Clients
│   │   └── persistence.py  # DB-Upsert für OrderState + AuditLog (opt-in)
│   └── modules/            # REST-Domänen (jeweils router/models/schemas/service)
│       ├── auth/           # Login + JWT
│       ├── tenants/        # Mandanten
│       ├── machines/       # Maschinen-Konfiguration
│       ├── orders/         # OrderState-CRUD
│       ├── audit/          # AuditLog-Read
│       ├── analytics/      # KPI-Berechnung
│       ├── alerts/         # Alarm-Konfiguration
│       ├── errors/         # Fehler-Verwaltung
│       ├── invoices/       # Rechnungs-Trigger
│       ├── labels/         # Etikett-Verwaltung
│       ├── cmc_actions/    # Resolve/Retry/Delete-Aktionen
│       └── simulator/      # Test-Hilfsendpunkte
└── scripts/
    ├── reset_events.py     # Truncate order_states + audit_logs
    └── tcp_forward.py      # TCP-Forwarder für lokale Tests
```

### 3.2 `app/main.py` — Bootstrap & Top-Level-API

Die `lifespan`-Funktion macht beim Start vier Dinge nacheinander:

1. **Tabellen anlegen falls nötig** — `Base.metadata.create_all(...)` für SQLite-Demo-Modus; bei Postgres macht das normalerweise Alembic.
2. **Default-Mandant + Admin bootstrappen** — `bootstrap_defaults()` aus `gateway/persistence.py`. Idempotent: läuft nichts an wenn die Defaults schon da sind. Der erste Login geht mit `admin@eperformances.de` / `admin123` (übersteuerbar per `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`).
3. **TCP-Gateway starten** — bindet den CIS-Port (default 15001). Wenn Railway den `PORT` für HTTP belegt und der mit unserem TCP-Port kollidiert, weicht der Gateway auf `port+1` aus. Fehler beim TCP-Start crashen die App nicht — HTTP/WebSocket laufen auch ohne.
4. **Shutdown-Hook** — beim Beenden werden offene TCP-Verbindungen geschlossen.

Außerhalb der Lifespan registriert `main.py` einige Endpunkte direkt (nicht über `modules/`-Router):

| Endpoint | Zweck |
|---|---|
| `GET /api/v1/events/recent?since=<id>` | Polling-Schnittstelle für die Live-Ansicht — liefert neue Ringbuffer-Events plus aktuellen Maschinen-State |
| `GET /api/v1/events/stream` | SSE-Fallback (text/event-stream) |
| `WS /ws/simulator` | WebSocket-Variante des gleichen Streams |
| `WS /ws/ping` | Keepalive-Sonde |
| `POST /api/v1/machines/{id}/mode` | Setzt Multi-Only oder löscht den Modus |
| `POST /api/v1/machines/{id}/expected-barcodes` | Setzt die CW-Liste pro Maschine |
| `GET /api/v1/gateway/status` | Diagnose: ist der TCP-Listener aktiv, welcher Port wurde gebunden, welche Maschinen sind verbunden |
| `GET /health` | Liveness-Probe für Railway |

Die Antwort von `/events/recent` ist die zentrale Live-Datenquelle für die UI und sieht so aus:

```json
{
  "latest_id": 12345,
  "events": [ { "id": 12340, "type": "ENQ", "data": { ... }, "timestamp": "..." }, ... ],
  "connected_machines": ["0001"],
  "pending_connections": 0,
  "machine_modes": { "0001": "multi_only" },
  "expected_barcodes": { "0001": ["M001", "M002"] }
}
```

Das Frontend kombiniert daraus die komplette UI-Darstellung; **es gibt keinen separaten Endpoint für „aktueller Maschinen-Status"** — alles fließt durch diesen einen Polling-Aufruf.

### 3.3 `gateway/connection.py` — Das Herzstück

Drei zentrale Klassen.

**`MachineConnection`** repräsentiert eine einzelne TCP-Verbindung. Sie hält Reader/Writer, einen Heartbeat-Zeitstempel und eine `protocol_id` (z.B. `"0001"`). Diese ID ist `None` solange die Maschine sich noch nicht identifiziert hat — sobald das erste Frame reinkommt, lesen wir die `machine_id` aus dem Payload und tragen sie ein.

**`ActivePackageTracker`** ist ein In-Memory-Mirror der aktiven Pakete pro Maschine. Er wird **synchron** im ENQ-Pfad konsultiert, damit der Backend ohne DB-Lookup entscheiden kann, ob ein Barcode bereits auf dem Band ist (Doppel-Scan-Detection). Pro Paket merkt er sich Barcode, State und die `enq_sequence` (der monotone Event-Zähler der Maschine). Methoden:

- `is_active_barcode(machine_id, barcode)` — synchron, kein await — für die Duplicate-Detection im ENQ-Handler.
- `apply(machine_id, msg_type, data, response_ref)` — wendet jedes Event auf den State-Machine an. Bei terminalen States (COMPLETED/EJECTED/DELETED) wird der Eintrag direkt aus dem Dict entfernt, damit der Speicher nicht unbeschränkt wächst.
- `eject_stale_predecessors(machine_id, current_seq)` — bei jedem END mit Sequenz N kippen wir alle noch-aktiven Vorgänger mit kleinerer Sequenz auf EJECTED und geben die Liste zurück, damit `connection.py` synthetische Events broadcasten kann.

**`ConnectionManager`** ist das Singleton, das Sockets, Modi und CW-Listen verwaltet. Wichtige Eigenschaften:

- `connected_machines: list[str]` — gibt **nur Protokoll-IDs** zurück (`"0001"`), niemals die internen Socket-Keys (`"machine_<ip>_<port>"`). Damit verschwindet das Phantom-Maschinen-Problem, das wir vorher hatten.
- `pending_connections: int` — Anzahl offener TCP-Sockets, deren Protokoll-ID noch nicht bekannt ist. Wird in der UI als „verbindet sich..." angezeigt, statt fälschlicherweise „kein Simulator verbunden".
- `machine_modes: dict[str, str]` — In-Memory-Map `protocol_id → "multi_only"`. Verschwindet beim Backend-Restart (gewollt).
- `expected_barcodes: dict[str, list[str]]` — die CW-Liste pro Maschine. Ebenfalls in-memory.
- `get_connection(machine_id)` — sucht erst per Socket-Key, fällt dann auf Protokoll-ID zurück, damit HTTP-Anfragen den passenden Socket finden.

Der **`_read_loop`** ist das Herzstück: für jede offene TCP-Verbindung läuft eine async Coroutine, die

1. ein Frame liest (`reader.read(4096)`),
2. es durch `parse_message` jagt (kann mehrere Events pro Frame ergeben),
3. die Protokoll-ID aus dem ersten Payload extrahiert (sofern noch nicht bekannt),
4. **latenzkritisch**: die Antwort baut und sofort zurückschickt — das ist der einzige synchrone Schritt im Loop, damit der Simulator nicht in seinen 2-Sekunden-Timeout läuft,
5. **non-blocking**: anschließend zwei `asyncio.create_task`-Aufrufe fanout: einen Broadcast ans Frontend, einen Persistenz-Task (sofern aktiv),
6. bei END zusätzlich die Sequence-based Ejection auslöst und synthetische `EJECT`-Events broadcastet.

Der Trick: alles was nach dem TCP-Reply kommt ist fire-and-forget. Wenn ein Browser langsam ist, blockiert das nie die Maschine.

### 3.4 `gateway/parser.py` — Wire-Format & Response-Logik

`parse_message(raw_bytes)` versucht drei Formate nacheinander: XML, JSON, Pipe-Delimited. Die echte CW1000 spricht Pipe-Delimited mit STX/ETX-Framing — wir akzeptieren alle drei, damit auch alternative Implementierungen funktionieren.

Pipe-Parsing nutzt eine positionale Tabelle (`POSITIONAL_FIELDS`), die für jeden Message-Typ definiert welche Felder in welcher Reihenfolge erwartet werden:

```python
POSITIONAL_FIELDS = {
    "ENQ":  ["event", "barcode", "source"],
    "ACK":  ["event", "reference_id", "good", "bad", "height_mm", "length_mm", ...],
    ...
}
```

`build_response(msg_type, data, *, is_duplicate=False, multi_only=False, expected_barcodes=None)` ist die zentrale Policy-Funktion. Für jeden Message-Typ baut sie ein Dict mit den Feldern, die in der Antwort zurückgehen. Die ENQ-Antwort ist die interessanteste, weil dort die ganze Routing-Logik sitzt:

```
            Eingehender ENQ-Barcode
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   leer/NOREAD?    ist_duplicate?   in CW-Liste?
        │              │              │
       Yes            Yes        Nein (Liste gesetzt)
        │              │              │
        ▼              ▼              ▼
   NOREAD-XXXX  DUPLICATE-XXXX  UNKNOWN-XXXX
   result=0     result=0       result=0
        │              │              │
        └──────────────┼──────────────┘
                       │
                       ▼
               multi_only AN +
              Barcode rein numerisch?
                       │
                ┌──────┴──────┐
              Yes            Nein
                │              │
                ▼              ▼
        SINGLE-REJECT-XXXX   refXXXX
        result=0             result=1
                             item_validated=true
```

Die Funktion gibt vier verschiedene Reject-Referenzen aus (`NOREAD-<event>`, `DUPLICATE-<event>`, `UNKNOWN-<event>`, `SINGLE-REJECT-<event>`), damit man am Ref-Prefix sofort sieht, warum etwas abgelehnt wurde. Im normalen Fall ist die Ref `ref<event>`. Außerdem schreibt sie ein `rejection_reason` ins Response-Dict, das `connection.py` ins Broadcast-Payload kopiert — daraus baut das Frontend dann den roten ABGEWIESEN-Banner.

`serialize_response(msg_type, response, machine_id)` macht aus dem Response-Dict wieder Bytes — Pipe-delimited mit STX/ETX. Für jeden Message-Typ gibt's eine eigene Field-Reihenfolge, die zum CW1000 passt.

### 3.5 `gateway/websocket.py` — Broadcast-Hub

`WebSocketManager` ist das Singleton (`ws_manager`), das jedes Event an alle interessierten Clients verteilt:

- Eine Deque mit max. 500 Einträgen (`_ring`) speichert die jüngsten Events plus aufsteigende numerische ID. Das ist die Quelle für `/api/v1/events/recent`.
- WebSocket-Clients (über `/ws/simulator`) bekommen direkt jeden Broadcast.
- SSE-Clients (über `/api/v1/events/stream`) bekommen ihren Stream über eine `asyncio.Queue` mit Backpressure.
- `broadcast(event)` macht alle drei Wege gleichzeitig — der Ring-Buffer wird IMMER beschrieben, auch wenn keine Clients aktiv sind. Deswegen funktioniert das Polling auch wenn nie ein Client connected war.

Wichtig: der Ring-Buffer **vergibt selbst die IDs**. Das Frontend merkt sich die höchste gesehene ID und fragt beim nächsten Poll `since=<diese_id>` ab — Server liefert nur Neueres. Das ist die einfachste Form von „resumable subscription".

### 3.6 `gateway/persistence.py` — Optional DB-Upsert

Die Funktion `persist_event(event_type, payload)` macht zwei Dinge wenn aktiv:

1. **OrderState upserten** — eine Zeile pro Paket, die alle Stations-Daten (Maße, Gewicht, Zeitstempel) akkumuliert. Der State entwickelt sich durch alle Events (ENQ → ASSIGNED, IND → INDUCTED, ACK → SCANNED oder DELETED je nach `good`-Flag, ...).
2. **AuditLog anhängen** — eine Zeile pro Event mit JSON-Payload und menschenlesbarem Text. HBT/STS werden übersprungen, damit die Tabelle lesbar bleibt.

Aktiviert wird das mit `EVENTS_PERSIST_ENABLED=true` in den Settings. Default: aus.

Außerdem enthält die Datei `bootstrap_defaults()` (legt Default-Tenant + Admin an) und `_eject_stale_predecessors()` (DB-seitige Variante der Sequence-based Cleanup, wird parallel zur In-Memory-Variante im Tracker ausgeführt wenn Persistenz an ist).

### 3.7 `core/` — Querschnittsthemen

- **`config.py`** — pydantic-`BaseSettings`. Wichtige Werte:
  - `database_url` (default SQLite, akzeptiert postgresql:// und schreibt's auf postgresql+asyncpg:// um)
  - `secret_key`, `algorithm`, Access-/Refresh-Token-Laufzeiten
  - `cmc_tcp_host` / `cmc_tcp_port` / `cmc_tcp_role` — TCP-Server-Bindung
  - `cors_origins` — Whitelist für die UI
  - `events_persist_enabled` — Persistenz-Toggle
- **`database.py`** — `async_session = sessionmaker(bind=async_engine, class_=AsyncSession, ...)`. Liefert per Depend-Injection einen Session-Generator, der bei Erfolg committet, bei Fehler rolled back.
- **`security.py`** — JWT-Token (HS256), Bcrypt-Passwort-Hashing. `create_access_token`, `create_refresh_token`, `verify_token`, `hash_password`, `verify_password`.
- **`permissions.py`** — `Role`-Enum mit Hierarchie SUPER_ADMIN > TENANT_ADMIN > OPERATOR > VIEWER. `require_role(min_role)` ist die FastAPI-Dependency, die Endpunkte schützt. `get_current_user` extrahiert den User aus dem Bearer-Token.
- **`logging.py`** — strukturierter JSON-Logger mit Kontext-Feldern (tenant_id, machine_id, reference_id, event_type) — damit man im Railway-Log nach einer reference_id filtern kann.

### 3.8 `modules/` — REST-Domänen

Jedes Modul folgt dem gleichen Muster: `router.py` (FastAPI-Routes), `models.py` (SQLAlchemy), `schemas.py` (Pydantic Request/Response), `service.py` (Geschäftslogik).

| Modul | Hauptzweck | Wichtigste Endpunkte |
|---|---|---|
| `auth` | Login + JWT | `POST /auth/login`, `POST /auth/register` |
| `tenants` | Multi-Tenant-Verwaltung | CRUD `/tenants` — SUPER_ADMIN |
| `machines` | Maschinen-Config | `GET/POST/PATCH/DELETE /machines` |
| `orders` | Persistierte Pakete | `GET /orders` mit Filtern, `POST /orders/{ref}/resolve` |
| `audit` | Audit-Log-Read | `GET /audit?from=...&to=...` |
| `analytics` | KPI-Berechnung | `GET /analytics/dashboard` — Throughput, Reject-Stats |
| `cmc_actions` | Live-Aktionen aus dem Dashboard | `POST /packages/{ref}/resolve|retry|delete` |
| `simulator` | Test-Verbindungen | nur für interne Tests |

Persistierte Endpunkte sind nur sinnvoll wenn `EVENTS_PERSIST_ENABLED=true` ist. Sonst sind `orders` und `audit` leer.

---

## 4. Frontend (`frontend/`)

### 4.1 Stack & Setup

- **React 19** + TypeScript, gebaut mit **Vite 8**.
- **Tailwind CSS 4** mit eigenem Token-System (`src/styles/tokens.css`).
- **React Router 7** für SPA-Routing.
- **i18next** für DE/EN.
- **Lucide-React** für Icons, **Recharts** für Diagramme.
- **Kein State-Management-Framework** — alles läuft mit `useState`/`useMemo`/`useEffect`. Die Datenquelle ist der Polling-Aufruf. Halten wir bewusst einfach.
- API-URL wird zur Laufzeit aus `window.__ENV__.VITE_API_URL` gelesen (injiziert vom Frontend-Dockerfile) oder zur Buildzeit aus `import.meta.env.VITE_API_URL`.

### 4.2 Datei-Hierarchie

```
frontend/src/
├── main.tsx                 # Entry: render <App/> in ErrorBoundary + i18n-Setup
├── App.tsx                  # React-Router-Routes + AppLayout-Wrapping
├── index.css                # Tailwind + Globals
├── pages/
│   ├── LoginPage.tsx
│   ├── LiveFlowPage.tsx     # ⭐ das Herz der Anwendung
│   ├── DashboardPage.tsx
│   ├── OrdersPage.tsx
│   ├── MachinesPage.tsx
│   ├── AnalyticsPage.tsx
│   ├── AuditPage.tsx
│   ├── SimulatorPage.tsx
│   ├── control/             # Platform-Admin (SUPER_ADMIN)
│   │   ├── ControlTenantsPage.tsx
│   │   ├── ControlUsersPage.tsx
│   │   ├── ControlMachinesPage.tsx
│   │   └── ControlSystemPage.tsx
│   └── settings/            # Tenant-Admin
│       ├── SettingsCompanyPage.tsx
│       ├── SettingsTeamPage.tsx
│       └── SettingsRolesPage.tsx
├── components/
│   ├── layout/              # AppLayout, Sidebar, Topbar, Header
│   ├── liveflow/            # TopStatusBar, LiveEventFeed, ErrorPanel, ...
│   ├── simulator/           # PackageStations (Stations-Mini-Visualisierung)
│   ├── RequireAuth.tsx      # Route-Guard
│   ├── ErrorBoundary.tsx
│   └── ui/                  # DataTable, StatCard, StatusBadge
├── lib/
│   └── packageLifecycle.ts  # ⭐ Event → Station → State-Mapping
├── services/
│   └── api.ts               # fetch-Wrapper mit Bearer-Auth
├── i18n/
│   ├── index.ts             # i18next-Init
│   ├── de.json              # Deutsch (Default)
│   └── en.json              # Englisch
├── styles/                  # Tokens + Layout-CSS
└── types/api.ts             # API-Response-Types
```

### 4.3 `pages/LiveFlowPage.tsx` — Das Herzstück

Das ist die zentrale Seite, die alles zusammenbringt. Sie ist eine 1000+-Zeilen-Komponente die unten in mehrere Sub-Komponenten zerlegt ist. Aufbau:

```
<div height=100vh, flex column>
  <TopStatusBar />                    # dunkles oberes Band
  <div grid 3 spalten>
    <MachineSidebar />                # links: Maschinen-Liste + CW-Liste
    <MainPane />                      # mitte: KPI-Karten + Pakettabelle
    <FocusPanel />                    # rechts: Detail des gewählten Pakets
  </div>
</div>
```

#### State (alles `useState` in der Komponente)

```typescript
const [events, setEvents]               // Roh-Events aus dem Polling
const [connected, setConnected]         // Backend erreichbar?
const [connectedMachines, ...]          // Protokoll-IDs der online-Maschinen
const [pendingConnections, ...]         // offene Sockets ohne ID
const [machineModes, ...]               // multi_only-Map
const [expectedBarcodes, ...]           // CW-Liste pro Maschine
const [selectedMachine, ...]            // welche Maschine ist fokussiert
const [selectedRef, ...]                // welches Paket ist im Focus-Panel
const [search, ...]                     // Such-Filter
const [sidebarOpen, ...]                // Sidebar auf-/zugeklappt
```

#### Datenfluss

1. **Polling** in einem `useEffect`: jede Sekunde `/api/v1/events/recent?since=<latest_id>` abfragen, neue Events anhängen (Cap bei 2000), Machine-State-Maps aktualisieren.

2. **Aggregation** (`aggregatePackages`): die Events werden gruppiert nach `reference_id`. Pro Ref entsteht eine `PackageRow` mit Barcode, Stations-Map, lifecycle State, Reject-Reason. Hier wird auch `applyEventToStations` aus `lib/packageLifecycle.ts` aufgerufen.

3. **Filterung & Ableitung**: die Pakete werden nach `selectedMachine` und `search` gefiltert. Stats (Total / Singles / Multi pro Maschine, Bucket-Counts) werden per `useMemo` aus der gefilterten Liste berechnet.

4. **Rendering**: die drei Panes bekommen die abgeleiteten Daten als Props. Re-Renders passieren ~1× pro Sekunde wenn neue Events reinkommen.

#### Aktions-Funktionen

- `setMachineMode(machineId, "multi_only" | null)` — optimistisches Update + POST an den Backend-Endpoint.
- `setMachineExpectedBarcodes(machineId, list | null)` — gleich, für die CW-Liste.
- `runAction(action, pkg)` — Resolve/Retry/Delete für Pakete (geht an `cmc_actions`-Endpunkte).

### 4.4 `lib/packageLifecycle.ts` — State-Machine

Zwei Hauptfunktionen:

**`applyEventToStations(event, stations)`** — schreibt fortschreitend die 6 Stationen (scanner / induction / sensor / wrapper / labeler / exit) auf `passed` oder `failed`. Wichtige Sonderfälle:

- ENQ mit `data.rejection_reason` → `stations.scanner = 'failed'` (rote Reject-Markierung).
- ACK mit `result=0` oder `good=false` → `stations.sensor = 'failed'`.
- END mit `status != 1` → `stations.exit = 'failed'`.
- Unser synthetisches `EJECT`-Event (Sequence-based Cleanup) → `stations.exit = 'failed'`.

**`deriveState(stations, removed)`** — leitet aus der Stations-Map den finalen Lifecycle-State ab (ASSIGNED → INDUCTED → SCANNED → LABELED → COMPLETED / EJECTED / DELETED / FAILED). Reihenfolge der Checks ist wichtig: erst `removed`, dann `scanner='failed'` (= rejected at scanner), dann `exit='failed'`, dann `exit='passed'`, dann `sensor='failed'`, dann nach vorne durchgehen.

### 4.5 Andere Pages

- **`DashboardPage`** — KPI-Karten und Throughput-Charts, holt sich Daten von `/analytics/dashboard`.
- **`OrdersPage`** — Tabelle mit allen Pakete aus DB-Persistenz; bei aktiver Persistenz nützlich, sonst leer.
- **`MachinesPage`** — Maschinen-CRUD, Anlegen über Modal.
- **`AnalyticsPage`** — detaillierte Charts (Recharts) für Dimensions, Weights, Reject-Reasons, Station-Timings.
- **`AuditPage`** — Tabelle mit AuditLog-Events, filterbar nach Zeitraum.
- **`SimulatorPage`** — entwicklerseitige Test-Verbindung zum Simulator, kann manuelle Events injizieren.
- **`LoginPage`** — Login-Formular, schreibt JWT in `localStorage`.
- **`control/`** und **`settings/`** — Admin-Bereiche, durch `require_role`-Endpoints abgesichert.

### 4.6 `components/layout/`

- **`AppLayout`** — wrapt jede Seite in Sidebar + Topbar + Content-Outlet.
- **`Sidebar`** — Navigations-Menü; Menüpunkte werden rollenbasiert ein-/ausgeblendet (z.B. „Verwaltung" nur für SUPER_ADMIN).
- **`Topbar`** — globaler oberer Bar mit Suche, Sprach-Toggle (DE/EN), User-Profile. Wird auf der LiveFlowPage durch unsere `liveflow/TopStatusBar` ersetzt.
- **`Header`** — Seiten-spezifischer Header mit Titel + Beschreibung.

### 4.7 `components/liveflow/`

Speziell für die Live-Seite gebaute Sub-Komponenten:

- **`TopStatusBar`** — der dunkle Header mit Maschinen-State, Connect-Status, „Live-Stream aktiv"-Text, letztem Event.
- **`LiveEventFeed`** — scrollender Event-Log (wird aktuell nicht prominent genutzt, ist auf der SimulatorPage relevant).
- **`PackageFlowTracker`** — visualisiert die 6 Stationen einer einzelnen Bestellung.
- **`MachineHealthPanel`** — Statusanzeige für Komponenten (Scanner/Drucker/etc.).
- **`ErrorPanel`** — generischer Fehler-Banner.

### 4.8 `services/api.ts`

Ein dünner `fetch`-Wrapper, der

- die Base-URL aus `window.__ENV__.VITE_API_URL` oder `import.meta.env.VITE_API_URL` zieht (Runtime > Build-Zeit > same-origin),
- bei jeder Anfrage automatisch den `Authorization: Bearer <token>`-Header setzt (Token aus `localStorage.access_token`),
- bei 401 ausloggt und zur Login-Seite umleitet.

### 4.9 i18n

Zwei vollständige Übersetzungs-JSONs: `de.json` (Default), `en.json`. Switch im Topbar speichert die Wahl in `localStorage.lang`. Komponenten nutzen `useTranslation()` und Keys wie `t('liveFlow.streamActive')`.

---

## 5. Datenfluss-Beispiel: ein Scan von vorne bis hinten

Zum Verständnis der Verzahnung: was passiert, wenn ein Operator am Simulator `send 'ENQ'` für Barcode `M123456` klickt — mit Multi-Only-Modus an und CW-Liste `[M123456, M654321]`?

1. **Simulator** schickt `\x020001|ENQ|108|M123456|2\x03` über TCP an die Railway-Proxy-Adresse.

2. **Railway-TCP-Proxy** leitet's an unseren `connection.py`-Listener weiter.

3. **`_handle_client`** akzeptiert die Verbindung (sofern noch keine offen ist). Falls neu, wird ein `MachineConnection` angelegt und in `_connections` registriert.

4. **`_read_loop`** liest die Bytes, ruft `parse_message`. Ergebnis: `{type: "ENQ", data: {machine_id: "0001", event: "108", barcode: "M123456", source: "2"}}`.

5. **Protokoll-ID-Erkennung**: weil `conn.protocol_id` noch `None` ist, wird sie auf `"0001"` gesetzt. Ab jetzt erscheint die Maschine in `/events/recent → connected_machines`.

6. **Duplicate-Check**: `_tracker.is_active_barcode("0001", "M123456")` — falls noch nicht auf Band, läuft weiter.

7. **`build_response("ENQ", data, is_duplicate=False, multi_only=True, expected_barcodes={"M123456", "M654321"})`**:
   - Barcode in CW-Liste? Ja → `is_unknown=False`.
   - `multi_only=True` + Barcode hat Buchstaben? Buchstaben da → kein single-reject.
   - → ENQ wird akzeptiert.
   - Ref wird zu `"ref0108"`.
   - Response-Dict: `{event: "108", reference_id: "ref0108", result: 1, item_validated: true, label_match: "M123456", lab1_enabled: True, feeders: "01000000", ...}`.

8. **`serialize_response`** baut: `b'\x020001|enq|108|ref0108|1||M123456|1|0|0|0|01000000\x03'`.

9. **`conn.send(response_bytes)`** schickt's zurück (synchron, ~ms).

10. **Tracker aktualisieren**: `_tracker.apply("machine_<ip>_<port>", "ENQ", data_mit_eingefügter_ref, "ref0108")` → Paket landet in State ASSIGNED, Sequence 108.

11. **Broadcast**: zwei async Tasks werden gestartet:
    - `ws_manager.broadcast({type: "ENQ", machine_id: "machine_<ip>_<port>", data: {... reference_id: "ref0108"}, ...})`
    - `ws_manager.broadcast({type: "ENQ_RESPONSE", data: response_dict, ...})`

12. **Ring-Buffer**: beide Events bekommen IDs und landen in der Deque.

13. Im **Frontend** poll'd `LiveFlowPage` eine Sekunde später `/api/v1/events/recent?since=<vorige_id>`. Antwort enthält die beiden neuen Events.

14. **`aggregatePackages`** ordnet sie der Ref `ref0108` zu. Eine neue `PackageRow` entsteht.

15. **`applyEventToStations`** auf das ENQ-Event: `stations.scanner = 'passed'` (kein `rejection_reason` im Payload).

16. **`deriveState`** → `ASSIGNED` → State-Badge „Zugewiesen", blau.

17. **`MainPane` rendert** eine neue Zeile in der Pakettabelle. „In Bearbeitung"-Counter steigt um 1.

18. **Operator klickt die Zeile an** → `setSelectedRef("ref0108")` → `FocusPanel` zeigt Details.

Total ~1 Sekunde Latenz vom physikalischen Scan bis zur sichtbaren Zeile, abhängig vom Polling-Intervall.

---

## 6. Features die wir konkret gebaut haben

Diese Liste fokussiert sich auf das, was wir **explizit gemacht haben** (über das hinaus, was die Standard-Bausteine eines FastAPI/React-Projekts liefern):

### 6.1 TCP-Gateway im selben Prozess wie HTTP
- **Wo:** `app/main.py:58-67` startet TCP-Server im FastAPI-Lifespan.
- **Wozu:** kein separater Daemon, einfaches Deployment auf Railway.
- **Konsequenz:** ein Crash im TCP-Read-Loop könnte HTTP mitreißen — deshalb extensive Exception-Handling im `_read_loop`.

### 6.2 In-Memory Ringbuffer für resumable Polling
- **Wo:** `app/gateway/websocket.py:31, 61-74`.
- **Wozu:** Railway-Proxy droppt WebSocket-Verbindungen. HTTP-Polling mit `since=<id>` ist die robusteste Live-Variante.
- **Konsequenz:** ältere Events fallen aus dem Buffer (Cap 500). Wer länger nicht polled, verpasst was.

### 6.3 Protokoll-ID statt Socket-Key in der UI
- **Wo:** `ConnectionManager.connected_machines` (`connection.py`), `MachineConnection.protocol_id`.
- **Wozu:** vorher tauchte beim Verbinden ein Phantom-Eintrag `100.64.0.x:18884` neben dem späteren `CW0001` auf — verwirrend.
- **Konsequenz:** Maschine wird erst sichtbar, wenn sie ein Frame schickt. Solange das nicht passiert, zeigt die UI „Simulator verbunden, wartet auf erste Nachricht…".

### 6.4 Multi-Only-Modus
- **Wo:** Toggle in `LiveFlowPage` neben dem Maschinen-Namen; Backend in `ConnectionManager._machine_modes` + `build_response`-Parameter; Endpoint `POST /machines/{id}/mode`.
- **Wozu:** Operator kann die Maschine in den „nur Multi-Order"-Modus schalten. Numerische Single-Order-Barcodes werden dann am Scanner mit `result=0` und `reference_id=SINGLE-REJECT-<event>` zurückgewiesen.
- **Persistenz:** In-Memory, verschwindet beim Backend-Restart.

### 6.5 CW-Liste mit UNKNOWN-Reject
- **Wo:** Sidebar in `LiveFlowPage` (`MachineSidebar`-Sub-Komponente) mit Input + Add/Remove; Backend in `ConnectionManager._expected_barcodes`; Endpoint `POST /machines/{id}/expected-barcodes`.
- **Wozu:** der Operator pflegt eine Liste erwarteter Barcodes pro Maschine. Alles was nicht drin steht, wird am Scanner mit `result=0` und ref `UNKNOWN-<event>` abgelehnt.
- **Eigenschaft:** wenn die Liste leer ist, ist kein Filter aktiv (alles wird angenommen).

### 6.6 Sequence-Based Stale Ejection
- **Wo:** `ActivePackageTracker.eject_stale_predecessors` + `connection.py`-Read-Loop nach END.
- **Wozu:** wenn eine Maschine bei Sequenz 105 ein END liefert, aber 102 und 103 noch im Aktiv-State stehen, sind die offensichtlich vom Band genommen worden. Wir kippen sie automatisch auf EJECTED und broadcasten synthetische `EJECT`-Events.
- **Im UI:** die Pakete springen ins „Problem"-Bucket mit Reject-Grund „Übersprungen (späteres END)".

### 6.7 Rejection-Visualisierung in der UI
- **Wo:** `applyEventToStations` markiert Scanner-Station als `failed` bei `rejection_reason`; `TableRow`-Komponente in `LiveFlowPage` rendert rote Border + rosa Hintergrund + Reject-Label-Subtext; Focus-Panel zeigt einen roten „ABGEWIESEN AM SCANNER"-Banner.
- **Wozu:** vorher gingen rejected Scans als normale „Zugewiesen"-Zeilen durch — der Operator konnte sie nicht von erfolgreichen unterscheiden.
- **Reasons:** unterscheidet `no_read`, `already_active`, `unknown_barcode`, `multi_only_mode`, `skipped_by_subsequent_end`, `dimensions_rejected`, `label_verification_failed` mit eigenen deutschen Labels.

### 6.8 Persistenz als Opt-In
- **Wo:** Setting `events_persist_enabled` in `core/config.py`, Early-Return in `persist_event`.
- **Wozu:** Demo-Modus soll keine DB-Zeilen produzieren. Für Produktion einfach Env-Var setzen.
- **Cleanup:** `backend/scripts/reset_events.py` truncatet `order_states` + `audit_logs`.

### 6.9 Pending-Connection-Status
- **Wo:** `ConnectionManager.pending_connections` zählt offene Sockets ohne Protokoll-ID; `/events/recent` gibt's mit, `LiveFlowPage` zeigt „Simulator verbunden, wartet auf erste Nachricht…" wenn `> 0`.
- **Wozu:** früher stand fälschlich „Kein Simulator verbunden" wenn der Sim verbunden war aber noch keine HBT geschickt hatte.

### 6.10 Robuste Antwort-Serialisierung
- **Wo:** `gateway/parser.py` — `serialize_response` mit positionalen Feldern pro Message-Typ, plus STX/ETX-Framing.
- **Wozu:** der CW1000-Simulator ist pingelig, was die Field-Reihenfolge angeht. Wenn auch nur ein Feld fehlt oder am falschen Index steht, sagt der Simulator „Reference is null" und der Rest läuft schief.

### 6.11 i18n DE/EN
- **Wo:** `i18n/de.json` + `i18n/en.json`, Toggle in `Topbar`.
- **Default:** Deutsch. Englisch parallel gepflegt.

### 6.12 Multi-Tenant + RBAC
- **Wo:** `core/permissions.py` mit Rollen-Hierarchie; `Tenant`-Model in `modules/tenants`; jedes Domain-Objekt (Machine, OrderState, AuditLog, User) hat `tenant_id`.
- **Wozu:** mehrere Kunden auf derselben Instanz, Plattform-Admin (SUPER_ADMIN) sieht alle, Tenant-User sehen nur ihren Mandanten.

---

## 7. API-Referenz (Kurzfassung)

### 7.1 Live-Stream
```
GET    /api/v1/events/recent?since=<id>&limit=200
GET    /api/v1/events/stream                          (SSE)
WS     /ws/simulator                                   (WebSocket)
WS     /ws/ping                                        (Keepalive)
```

### 7.2 Runtime-Steuerung der Maschine
```
POST   /api/v1/machines/{machine_id}/mode
       { "mode": "multi_only" | null }

POST   /api/v1/machines/{machine_id}/expected-barcodes
       { "barcodes": ["M001", ...] | null }
```

### 7.3 Diagnose
```
GET    /api/v1/gateway/status
GET    /health
```

### 7.4 Auth
```
POST   /api/v1/auth/login                              { email, password } → { access_token, refresh_token }
POST   /api/v1/auth/register                           (TENANT_ADMIN+)
```

### 7.5 Domain-Endpunkte (alle erfordern Login)
```
GET    /api/v1/machines
POST   /api/v1/machines                                (TENANT_ADMIN)
PATCH  /api/v1/machines/{id}                           (TENANT_ADMIN)
DELETE /api/v1/machines/{id}                           (TENANT_ADMIN)

GET    /api/v1/orders?state=...&machine_id=...
POST   /api/v1/packages/{reference_id}/resolve         (OPERATOR)
POST   /api/v1/packages/{reference_id}/retry           (TENANT_ADMIN)
POST   /api/v1/packages/{reference_id}/delete          (TENANT_ADMIN)

GET    /api/v1/audit?from=...&to=...
GET    /api/v1/analytics/dashboard

GET    /api/v1/tenants                                 (SUPER_ADMIN)
POST   /api/v1/tenants                                 (SUPER_ADMIN)
```

---

## 8. Deployment

### 8.1 Railway-Struktur

Drei Services im Railway-Projekt:
- **CMC DB** (Postgres)
- **CMC Backend** — `backend/`-Verzeichnis, Dockerfile, auto-deploy auf Push zu `main`
- **CMC Frontend** — `frontend/`-Verzeichnis, multi-stage Build, auto-deploy auf Push zu `main`

### 8.2 Wichtige Env-Variablen

**Backend:**
- `DATABASE_URL` — Postgres-URL, Railway injiziert sie aus dem Postgres-Service
- `SECRET_KEY` — JWT-Secret, MUSS produktiv überschrieben werden
- `CORS_ORIGINS` — kommaseparierte Liste der Frontend-Domains
- `CMC_TCP_PORT` — default 15001
- `EVENTS_PERSIST_ENABLED` — `true` aktiviert DB-Writes
- `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` — Override für Default-Admin
- `PORT` — Railway setzt das automatisch für HTTP

**Frontend:**
- `VITE_API_URL` — URL des Backend-Service, wird vom Frontend-Dockerfile in `window.__ENV__` injiziert

### 8.3 TCP-Proxy

Railway exponiert den TCP-Port über deren Proxy: `metro.proxy.rlwy.net:<random_port>`. Der CMC-Simulator (oder eine echte Maschine im Client-Modus) verbindet sich an diese Adresse. **Public-Static-IP-Egress** ist auf der Railway-Side aus, also ist die Adresse stabil pro Deployment, kann sich aber bei Re-Provisioning ändern.

### 8.4 Local Development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev          # läuft auf :5173, proxied /api → :8000 via vite.config.ts
```

Simulator (Windows-Anwendung von CMC) verbindet sich gegen `localhost:15001`.

---

## 9. Bekannte Einschränkungen

### 9.1 Persistenz aktuell aus

`EVENTS_PERSIST_ENABLED=false` ist der Default. Damit fehlen historische Daten in `OrdersPage`, `AuditPage`, `AnalyticsPage` — die zeigen nur leere Tabellen. Solange wir mit dem Simulator testen ist das egal, für eine erste echte Pilot-Installation müsste der Schalter umgelegt werden.

### 9.2 Multi-Maschinen-UX

Wenn mehrere Maschinen gleichzeitig verbunden sind, zeigt die Sidebar alle. Es gibt aber noch keine Maschinen-übergreifenden KPIs auf der LiveFlowPage — die Stats sind immer pro selektierter Maschine.

### 9.3 ACK-Mid-Flight-Reject

Aktuell ist nur ENQ-Reject implementiert. Wenn ein Operator nachträglich Multi-Only einschaltet, während ein Single-Order-Paket schon auf dem Band ist, könnten wir dieses am ACK ausschleusen (`good=0, bad=1` in der ACK-Antwort). Das ist noch nicht gebaut.

### 9.4 CW-Liste pflegt sich nicht selbst

Die CW-Liste wird manuell vom Operator gepflegt. Eine Anbindung an ein WMS-System (Pulpo, SAP, Weclapp etc.), das die Liste automatisch synchronisiert, fehlt noch.

### 9.5 Resolve/Retry/Delete schreiben in DB

Die operator-seitigen Aktionen (`POST /packages/{ref}/resolve` etc.) greifen auf die `OrderState`-Tabelle zu. Mit Persistenz aus laufen sie ins Leere. Sie müssen entweder die In-Memory-Datenstruktur des Trackers manipulieren oder Persistenz erfordern.

---

## 10. Wie erweitert man das Projekt?

### 10.1 Neues Maschinen-Setting hinzufügen (wie Multi-Only)

1. **Backend Speicher**: Dict in `ConnectionManager` anlegen (analog zu `_machine_modes`).
2. **Build-Response anpassen**: Parameter in `parser.build_response` ergänzen, Reject-Logik einbauen.
3. **Read-Loop verdrahten**: in `connection.py` den neuen Parameter aus dem Manager lesen und durchreichen.
4. **API-Endpoint**: `POST /api/v1/machines/{id}/<setting>` in `main.py`.
5. **In `/events/recent` mitliefern**.
6. **Frontend State**: in `LiveFlowPage` State + Setter + Polling-Hook.
7. **UI-Element**: neues Toggle/Input.
8. **i18n-Keys** in `de.json` + `en.json`.

### 10.2 Neue Reject-Kategorie

1. Reject-Reason als Konstante in `parser.py` definieren (z.B. `"too_heavy"`).
2. In `build_response` die Bedingung einbauen (idealerweise vor der ENQ-`accept_enq`-Berechnung).
3. Neuen Ref-Prefix vergeben (z.B. `OVERWEIGHT-<event>`).
4. Frontend: `REJECTION_LABEL` in `LiveFlowPage.tsx` um den deutschen Text erweitern.
5. Optional: in `applyEventToStations` ein anderes Station-Failed setzen, wenn die Ablehnung an einem späteren Punkt passiert.

### 10.3 Neuer Domain-Endpoint (z.B. Reports)

1. Neues Modul-Verzeichnis `backend/app/modules/reports/` mit `router.py`, `models.py`, `schemas.py`, `service.py`.
2. Router in `main.py` einhängen: `app.include_router(reports_router, prefix="/api/v1")`.
3. Optional: DB-Migration via Alembic.
4. Frontend: `services/api.ts` aufrufen, neue Page oder Komponente in `pages/`.

---

## 11. Quellen & Hintergrund

- **`cmc-process-documentation.pdf`** (Repo-Root) — die Prozess-Dokumentation, an der sich die State-Maschine und die Routing-Regeln orientieren.
- **`Kommunikation CartonWrap.pdf`** (Repo-Root) — die offizielle CMC-Beschreibung des CIS-Protokolls.
- **CW1000 CIS rel 4.0 Simulator** — Windows-Tool von CMC, mit dem wir die Wire-Format-Details validiert haben.

Die exakten Field-Layouts unserer Pipe-Parser und -Serializer sind am Simulator empirisch verifiziert, nicht aus den PDFs abgelesen — die offizielle Spec liefert CMC normalerweise im Projekt-Kickoff.

---

## 12. Pulpo-Integration & UI-Redesign (Stand 2026-06)

Dieser Abschnitt hält den Stand fest, der nach der ursprünglichen Doku dazukam.

### 12.1 Pulpo-Modul (`backend/app/modules/pulpo/`)

| Datei | Zweck |
|---|---|
| `client.py` | `PulpoClient` gegen die echte Pulpo-WMS-API (`eu.pulpo.co/api/v1`). **OAuth2 Password-Flow** (`POST /api/v1/auth` → Bearer-Token, in-memory gecacht, 401 → 1× Re-Auth). Methoden: Lookup (`find_packing_orders_by_ean`, `get_cartbox_by_barcode`, `list_queue_orders`, `get_product`, `list_shipping_locations`) und Deferred-Writes (`accept`/`create_box`/`update_box`/`create_shipment_tracking`/`attach_document`/`attach_label`/`finish`/`close`). |
| `runtime.py` | `pulpo_runtime` — **Test-Modus-Schalter** (`write_enabled`, Default **False**) + `last_sync_at`. |
| `cw_sync.py` | Baut die CW-Liste aus der Pulpo-**Packing-Queue**: `build_cw_items_for_location` (Präfix-Filter), `sync_cw_lists_from_cache`, `resync_cache_from_pulpo` (Self-Heal). |
| `models.py` | Cache-Tabellen `pulpo_packing_orders` / `pulpo_order_items` (+ `deferred_writes`, `sync_state`). |
| `router.py` | Webhook-Endpoints + Signatur/Secret-Prüfung. |
| `service.py` | Mapping Webhook-Payload → Cache (defensiv). |
| `wms-openapi.json` | Vendored Pulpo-WMS-OpenAPI als Referenz. |

### 12.2 Test-Modus (Schreib-Sicherheit)
- **Default: keine Schreibvorgänge an Pulpo.** Jede Schreib-Methode prüft `pulpo_runtime.write_enabled` (`_require_writes()`) und wirft sofort, bevor ein Request rausgeht.
- Lesen (CW-Listen / Queue) ist immer erlaubt.
- Umschaltbar in **Einstellungen → Pulpo-Anbindung** (persistiert in `tenant.settings`, beim Start geladen). Banner im LiveFlow zeigt den Modus.

### 12.3 CW-Listen kommen aus Pulpo (kein manuelles Eintippen mehr)
- Quelle ist die **Packing-Queue** (`GET /packing/orders?state=queue`), **nicht** Picking.
- Der **Lagerplatz**-Code unterscheidet: `CW1`/`CW6`/`CW10` = CartonWrap, `SACK*` = Sack-Packen.
- Die Maschine hat ein Feld **`pulpo_pick_location`** = **Präfix** (z.B. `CW`) → matcht `CW%`, schließt `SACK*` aus. Leer = ganze Queue.
- Auto-Befüllung: **Webhooks** (`packing_order_created/finished`) + **periodischer Resync** (`CW_SYNC_INTERVAL_S`, Default 30s, mit Self-Heal). Die CW-Liste ist `source="pulpo"` → im UI **read-only**.
- Items tragen SKU/`product_id`, nicht zwingend EAN → `_resolve_ean` löst per Produkt-Lookup auf.

### 12.4 Webhooks
- **Ein** Sammel-Endpoint `POST /api/v1/webhooks/pulpo` (dispatcht per Event-Typ) + die Einzel-Routen `…/packing_order_created|finished|box_closed`.
- **Auth: `?secret=`-Query-Param** (Pulpos Mechanismus, aus den Webhook-Logs verifiziert) gegen `PULPO_WEBHOOK_SECRET`; HMAC-Header als Fallback; leeres Secret = ungeprüft akzeptieren.

### 12.5 Neue/aktualisierte Endpoints
```
POST /api/v1/webhooks/pulpo[?secret=…]              (+ /packing_order_created|finished|box_closed)
GET  /api/v1/settings/pulpo                          → { test_mode, write_enabled }
PUT  /api/v1/settings/pulpo   { test_mode }          (persistiert)
GET  /api/v1/settings/pulpo/status                   → { test_mode, configured, last_sync_at, open_orders, barcodes }
GET  /api/v1/machines/{id}, PATCH /api/v1/machines/{id}  (jetzt inkl. pulpo_pick_location)
```

### 12.6 Neue Env-Variablen (Backend)
```
PULPO_BASE_URL (Default https://eu.pulpo.co) · PULPO_USERNAME · PULPO_PASSWORD · PULPO_SCOPE (general)
PULPO_WEBHOOK_SECRET · CW_SYNC_INTERVAL_S (30)
```
`PULPO_API_KEY` ist Legacy/ungenutzt (seit OAuth2).

### 12.7 Frontend
- **Navigation** zeigt jetzt zusätzlich **Maschinen** und **Einstellungen** (vorher nur Dashboard + Simulator).
- **Gemeinsame Styles**: `styles/components/modal.css` (`.modal*`) und `styles/components/table.css` (`.data-table*`) — eine Quelle für alle Modale/Tabellen.
- **Maschinen-Modal** auf Karten-Sektionen umgebaut (Basisdaten/Netzwerk/Pulpo/Abmessungen/Stationen), inkl. **Edit-Modus** + `pulpo_pick_location`-Feld.
- **Maschinen-Seite**: Stat-Karten (gesamt/online/Warnungen/Verbindungen) + Pulpo-Location-Spalte + ✏️-Edit.
- **Einstellungen → Firma**: Firmenprofil, **Pulpo-Anbindung-Karte** (Status + Test-Modus-Schalter + Sync-Stats), Schnellzugriff, Abonnement.
- **Simulator-Seite**: Icon-Stat-Karten + Connection-Karte, „Verbundene Maschinen" + **Paket-Verlauf-Donut**.
- **LiveFlow**: Stat-Karten mit Sparklines, Tab-Leiste Aufträge/CW-Listen, **„Alle CW-Listen"**-Filter, Pagination; CW-Listen read-only mit „PULPO"-Badge.

### 12.8 Bekannte offene Punkte
- **Deferred-Writes-Flow ist noch NICHT verdrahtet** — bei END wird (noch) nichts an Pulpo geschrieben. Erst wenn das gebaut ist, hat „Test-Modus aus" echte Schreib-Wirkung.
- **Exakte Pulpo-Feldnamen** (Lagerplatz-Code, EAN/SKU im Item) werden gegen echte `Pulpo sample order FULL`-Logs final verifiziert; Extraktion ist bis dahin defensiv.

> Hinweis: Damit ist die in §9.4 genannte Lücke („CW-Liste pflegt sich nicht selbst") **adressiert** — die Liste kommt jetzt automatisch aus Pulpo (read-only).
