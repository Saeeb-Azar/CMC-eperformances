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
