# CMC ePerformances

CIS-Anbindung für die CMC CartonWrap-Linie (siehe `Kommunikation CartonWrap.pdf`).
React/Vite-Frontend + FastAPI-Backend.

```
├── frontend/    # React + Vite + TypeScript (Port 5173)
├── backend/     # FastAPI + Python (HTTP 8000, TCP-Gateway 15001)
```

## Lokaler Start

Standardmäßig wird eine lokale SQLite-Datei (`backend/local.db`) verwendet — kein
Postgres-Install nötig. Beim ersten Start wird das Schema automatisch angelegt,
ein Default-Tenant und ein Admin-User werden geseeded.

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- HTTP API: <http://localhost:8000>  (Swagger: `/docs`)
- TCP-Gateway für CMC-Simulator: `localhost:15001`
- Default-Login: `admin@eperformances.de` / `admin123`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- Web-UI: <http://localhost:5173>  (proxyt `/api` → `:8000`)

### Später: Supabase statt SQLite

```bash
export DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>"
# postgresql:// wird intern zu postgresql+asyncpg:// umgeschrieben
```

### Pulpo-WMS-Anbindung (optional)

Liest die Packing-Queue aus Pulpo und befüllt die CW-Listen automatisch
(read-only). Details: `docs/PROJECT.md` §12.

```bash
export PULPO_USERNAME="<pulpo-user>"
export PULPO_PASSWORD="<pulpo-pass>"
export PULPO_SCOPE="general"                 # Default
export PULPO_WEBHOOK_SECRET="<selbst-vergeben>"  # = ?secret=… in der Pulpo-Webhook-URL
# Maschine im Dashboard: Pulpo Pick-Location = "CW" (Präfix, matcht CW1/CW6/CW10)
```

> **Test-Modus** ist Default: es wird nur aus Pulpo gelesen, **nichts geschrieben**.
> Umschaltbar unter Einstellungen → Pulpo-Anbindung.

## Dokumentation

- [`docs/TECHNISCHE_DOKUMENTATION.md`](docs/TECHNISCHE_DOKUMENTATION.md) — Was die Software kann, technische Umsetzung, API, Deployment, Build-Schritte
- [`docs/PFLICHTENHEFT.md`](docs/PFLICHTENHEFT.md) — Anforderungen (FA/NFA), Schnittstellen, Abnahmekriterien, Umsetzungsstand
- [`docs/ANWENDERHANDBUCH.md`](docs/ANWENDERHANDBUCH.md) — Ausführliche Bedienungsanleitung (Operator + Admin)
- [`docs/PROJECT.md`](docs/PROJECT.md) — Entwickler-Referenz (Code-Struktur im Detail)
- [`docs/ENTSCHEIDUNGEN.md`](docs/ENTSCHEIDUNGEN.md) — Architektur-Entscheidungen & Begründungen
