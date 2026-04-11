# CMC ePerformances

Full-stack application with React (Vite) frontend and FastAPI backend, deployed on Railway.

## Project Structure

```
├── frontend/    # React + Vite + TypeScript
├── backend/     # FastAPI + Python
└── railway.toml # Railway deployment config
```

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```
