# Architektur-Entscheidungen & Verbindungs-Setup

Kurze Begründungs-Doku — warum wir uns bei den großen Architektur-Fragen so entschieden haben, und wie das physische Setup aussieht: vom Simulator bis zum Browser.

---

## 1. Warum Railway als Hosting?

### Was wir gebraucht haben

Drei Dinge musste die Hosting-Umgebung können:

1. **Einen langlebigen Python-Prozess laufen lassen.** Unser Gateway ist kein „bei Request kurz hochfahren"-Workload (wie Lambda oder Firebase Functions). Es muss permanent einen TCP-Socket offen halten und auf eingehende Verbindungen vom CMC-Simulator hören.
2. **Einen raw-TCP-Port nach außen exponieren.** Nicht nur HTTPS — die Maschine spricht TCP auf Port 15001, ohne Verschlüsselung, mit Pipe-delimited Bytes. Das geht durch keine Standard-HTTPS-Proxy-Lösung durch.
3. **Eine Postgres-Instanz daneben** für später, wenn wir Persistenz wieder anschalten.

### Was wir ausgeschlossen haben

- **Firebase** — kann keine permanenten TCP-Sockets hosten. Firebase Functions sind kurzlebig. Walspro hat dieses Limit ja gerade dadurch umgangen, dass sie einen lokalen Python-Agent auf dem PC nebenan installieren — den wollten wir uns für die Demo-Phase sparen.
- **Vercel/Netlify** — beide sind für statisches Frontend + Serverless Backend gedacht, kein Long-Running-Prozess, kein TCP.
- **Reine VPS-Anbieter (Hetzner Cloud, DigitalOcean Droplet)** — geht zwar technisch, hätten wir aber alles selbst aufsetzen müssen: TLS-Cert, Reverse-Proxy, CI/CD-Pipeline, Datenbank-Backups. Zu viel Yak-Shaving für ein Demo-Projekt.
- **AWS ECS/Fargate** — kann das, aber Setup und Kosten sind für eine Zwei-Personen-Demo überdimensioniert.

### Warum dann Railway

- **Hostet langlebige Container** mit einem `Dockerfile` — wie ein klassisches PaaS.
- **TCP-Proxy out-of-the-box**: man kriegt eine Adresse wie `metro.proxy.rlwy.net:42513` und Railway routet TCP-Verbindungen zu der internen Port-Mappung im Container. Genau das, was wir für den Simulator brauchen.
- **Postgres als Plugin** mit einer Click-und-fertig-Erstellung.
- **GitHub-Integration mit Auto-Deploy** bei jedem Push auf `main`. Kein eigener CI-Pipeline-Code nötig.
- **Live-Logs im Browser**, die wir während des Bauens dauernd genutzt haben.
- **Bezahlbar** für Demo-Zwecke — pay-as-you-go, ein paar Euro im Monat.

Der Preis: Railway ist **nicht** primär für Echtzeit-TCP-Workloads optimiert. Der TCP-Proxy ist ein Standard-Netzwerk-Hop, fügt Latenz hinzu, und kann bei Wartungs-Events kurzfristig kappen. Für unser Demo-Tempo OK, für eine echte Fabrik-Linie auf Dauer suboptimal.

---

## 2. Warum ein einziger Backend-Prozess statt Cloud + lokaler Agent?

Die „saubere" Architektur, die in der CMC-Doku beschrieben wird, hat zwei Komponenten:

```
Maschine ↔ Lokaler Agent (PC neben der Maschine) ↔ Cloud ↔ Browser
```

Wir machen stattdessen:

```
Maschine (Simulator) ↔ Railway-Backend (alles in einem) ↔ Browser
```

Drei Gründe für die Vereinfachung:

1. **Wir testen mit dem Simulator, nicht einer echten Maschine.** Der Simulator läuft auf einem normalen Windows-PC und kann ausgehend per TCP gegen jede Internet-Adresse wählen. Eine echte CMC in einer Fabrik-LAN könnte das wegen Firewalls oft nicht — da bräuchte sie einen LAN-lokalen TCP-Partner. Für unseren Use-Case fällt das Problem weg.
2. **Ein Prozess heißt ein Deployment.** Kein Code-Sync zwischen Cloud und Agent, keine Versionsdiskrepanzen, kein Installer für den Operator. Push auf `main`, fertig.
3. **Latenz spielt für Demo keine Rolle.** Der Simulator gibt uns 2 Sekunden Zeit für die ENQ-Antwort. Internet → Railway → Antwort braucht 50–200ms. Genug Puffer. In einer Produktions-Linie mit unstabilem Uplink wäre das anders.

Was uns die Vereinfachung kostet:
- Wir können **keine echte CMC auf einer Fabrik-LAN** direkt anbinden ohne Workaround.
- Bei Internet-Ausfall ist die ganze Linie tot, statt nur „kein Sync zur Cloud".
- Customer-IT wird argwöhnisch, wenn Maschinen Outbound-TCP zu unbekannten Hosts machen sollen.

**Wenn der Demo zur Produktion wird, sollten wir den Agent rausziehen** — `app/gateway/connection.py` + `parser.py` + `websocket.py` lassen sich als eigenständiges Python-Programm verpacken (PyInstaller → `.exe`), das auf einem Mini-PC neben der Maschine läuft. Das Cloud-Backend bleibt im Wesentlichen wie es ist, nur ohne TCP-Listener.

---

## 3. Wie kommt die Maschine zur Webapp?

Schritt-für-Schritt-Walkthrough, wenn du den Simulator zum ersten Mal startest:

### Schritt 1 — Backend startet

Railway baut den `backend/Dockerfile`, fährt den Container hoch. In der `lifespan`-Funktion (`backend/app/main.py:58-67`) bindet FastAPI zwei Ports:

- HTTP auf `$PORT` (Railway setzt den env var) — das ist der von Railway weitergegebene HTTPS-Endpoint.
- TCP auf `15001` (oder `$PORT+1` falls die kollidieren) — das ist der CIS-Listener.

Railway gibt dem TCP-Port eine öffentliche Adresse, z.B. `metro.proxy.rlwy.net:42513`. Findest du in den Railway-Service-Settings unter „Networking".

### Schritt 2 — Simulator konfigurieren

Im CW1000 Simulator (Windows-Tool):

```
TCP/IP role:    [ ] Server   [×] Client      ← Client-Modus, wir dialen raus
IP address:
   IPserver:    192.168.178.42                ← egal, wird ignoriert im Client-Mode
   IPclient:    <Railway-IP, z.B. 66.33.22.233>
   Port:        42513                          ← der Port aus Railway

MachineID:      0001
```

Die IP bekommt man durch ein `nslookup metro.proxy.rlwy.net` in einer CMD-Box. Wichtig: Railway-Proxy verteilt sich auf mehrere IPs, also kann der `nslookup` mehrere zurückliefern. Eine davon nehmen.

### Schritt 3 — Verbindung herstellen

Im Simulator klickst du `press to OPEN`. Drei Sachen passieren:

```
Simulator                          Railway-Proxy                   Backend-Prozess
─────────                          ─────────────                   ───────────────
TCP connect zu                ──▶  routet TCP-Stream zu      ──▶   acceptet auf Port 15001
metro.proxy.rlwy.net:42513         containerinternem Port           ConnectionManager._handle_client
                                                                    erzeugt MachineConnection
                                                                    socket-key = "machine_100.64.0.x_55555"
                                                                    protocol_id = None (noch unbekannt)
```

Im Backend sieht das so aus (logs):
```
INFO  New machine connection from ('100.64.0.5', 55555)
```

Im Browser auf der LiveFlowPage taucht jetzt **noch nichts** auf — die Maschine hat sich ja noch nicht identifiziert. Stattdessen zeigt der Header „Simulator verbunden, wartet auf erste Nachricht…" — das ist genau der Zustand `pending_connections > 0, connected_machines == []`.

### Schritt 4 — Erstes Frame

Im Simulator klickst du z.B. `send 'HBT'` (oder lässt das „Send HBT automatic alle 5s" angehakt). Der Simulator schickt:

```
\x02 0001|HBT \x03
```

Backend (`_read_loop` in `connection.py`):

1. Liest die Bytes.
2. `parser.parse_message` macht draus `{type: "HBT", data: {machine_id: "0001"}}`.
3. **Erste-Frame-Logik**: weil `conn.protocol_id` noch `None` ist, wird sie auf `"0001"` gesetzt.
4. **Antwort bauen** über `build_response("HBT", ...)` → `{result: 1}`.
5. **Antwort serialisieren** → `\x02 0001|hbt|1 \x03`.
6. **Zurückschicken** per `conn.send(bytes)` — synchron, ~ms.
7. **Broadcast** ans Frontend (asynchron, fire-and-forget).

Im Browser auf der LiveFlowPage ändert sich jetzt zweierlei:

- In der Sidebar erscheint **`CW0001`** mit dem „online"-grünen Punkt.
- Der Header wechselt auf „Live-Stream aktiv".

### Schritt 5 — Nutzdaten-Frames

Jetzt klickst du `send 'ENQ'` mit einem Barcode wie `M123456`. Der Loop wiederholt sich, nur dass diesmal die `build_response` mehr Logik hat:

- Ist der Modus `multi_only`? → schaut in `ConnectionManager._machine_modes["0001"]`.
- Gibt's eine CW-Liste? → schaut in `ConnectionManager._expected_barcodes["0001"]`.
- Schon auf Band? → `ActivePackageTracker.is_active_barcode(...)`.

Je nach Ergebnis: Reject mit `NOREAD-`/`UNKNOWN-`/`DUPLICATE-`/`SINGLE-REJECT-` Ref oder Accept mit normaler `ref<event>`-Ref.

### Schritt 6 — Browser sieht es

Der Browser polled jede Sekunde `/api/v1/events/recent?since=<latest_id>`. Die Antwort enthält das neue ENQ-Event mit allen Feldern. `LiveFlowPage.aggregatePackages` sortiert es in die Pakettabelle ein. Bei Reject: rote Markierung mit Grund. Bei Accept: blaue „Zugewiesen"-Badge.

Latenz Browser-Sicht: 0–1000ms (abhängig vom Polling-Zeitfenster). Im Schnitt 500ms.

---

## 4. Warum Polling statt WebSocket?

WebSocket wäre eleganter — Server pusht Events sofort, kein 1-Sekunden-Lag. Wir hatten WebSocket auch erst, haben dann aber auf Polling als Default umgeschwenkt. Gründe:

1. **Railway-Proxy droppt WebSocket-Verbindungen** bei längerer Inaktivität, bei Wartungs-Events, oder wenn der Container neu deployed wird. Reconnect-Logik im Frontend ist machbar, aber fehleranfällig.
2. **Polling ist resumable**: das Frontend merkt sich die höchste gesehene Event-ID. Wenn die Verbindung mal kurz weg ist, holt der nächste Poll alle verpassten Events nach. Kein Event-Loss.
3. **Polling funktioniert hinter jedem Proxy/Firewall**: ein einfacher GET-Request, kein Upgrade-Header, kein langer offener Socket.

WebSocket und SSE sind weiter im Code drin (`/ws/simulator`, `/api/v1/events/stream`), aktuell aber ungenutzt. Bei wem Polling-Last später ein Problem wird, könnte man auf WebSocket primary + Polling fallback umstellen.

---

## 5. Warum Persistenz aus?

Per Default ist `EVENTS_PERSIST_ENABLED=false`. Hintergrund:

- Während wir am Testen waren, wollten wir nicht, dass die DB sich mit jeder Demo-Session füllt — speziell mit Doppelt-Scans und Test-Refs.
- Die Live-Ansicht braucht die DB sowieso nicht; sie liest aus dem In-Memory-Ringbuffer.
- Sobald Persistenz an ist, fließen Events in zwei Tabellen: `order_states` (eine Zeile pro Paket) und `audit_logs` (eine Zeile pro Event). Heartbeats werden gefiltert, damit `audit_logs` nicht explodiert.

Für eine echte Pilot-Installation: Env-Var auf `true` setzen, Backend redeployen, fertig. Falls Altdaten weg sollen: `python -m scripts.reset_events` im Railway-Shell.

---

## 6. Zusammenfassung der Trade-offs

| Entscheidung | Vorteil | Nachteil |
|---|---|---|
| Railway als Hosting | Schnelles Deployment, TCP-Proxy out-of-the-box, Postgres dabei | TCP-Proxy nicht für Echtzeit-Last optimiert, Latenz höher als LAN-lokal |
| Ein Backend-Prozess statt Cloud + Agent | Eine Codebase, ein Deployment, keine Sync-Probleme | Echte Maschine in einer Fabrik-LAN könnte nicht direkt durchwählen |
| HTTP-Polling statt WebSocket | Resumable, proxy-resistant, einfach | 1s-Latenz im Best Case |
| Persistenz off als Default | Saubere Demos, keine DB-Müll | Historische Daten erst sichtbar wenn an |
| Reine TypeScript/Python-Codebase, kein Framework wie tRPC | Lesbar, debuggbar, keine Magic | Etwas mehr Boilerplate beim Endpoint-Schreiben |

---

## 7. Was als nächstes?

Wenn diese Demo zur ernsthaften Anwendung weiterwachsen soll, ist die Reihenfolge:

1. **Persistenz an + Reset-Workflow definieren** (relativ einfach, ein Env-Var).
2. **Lokalen Agent rausziehen** für den Fall, dass eine echte CMC ohne Internet-Outbound angebunden werden muss.
3. **CW-Liste an ein WMS koppeln** (Pulpo, SAP, Weclapp — je nach Kunde) per Webhook oder Polling-Sync.
4. **Operator-Aktionen** (Resolve/Retry/Delete) aus der UI vollständig auf den In-Memory-Tracker durchschalten, damit sie auch ohne Persistenz funktionieren.
5. **Multi-Maschinen-Dashboard** — heute zeigt die LiveFlowPage immer nur eine Maschine. Eine Übersichtsseite mit allen wäre der nächste UX-Schritt.

Punkte 1–3 sind die Voraussetzung für eine Pilot-Installation bei einem echten Kunden. 4 und 5 sind UX-Politur.
