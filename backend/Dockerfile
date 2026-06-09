FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# On startup: run pending migrations, then start the API server.
# Migrations run with `|| echo` (not `&&`) on purpose: a failed migration must
# NOT stop uvicorn from booting. Otherwise the whole service returns 502 "Bad
# Gateway" with no way to see why. This way the API always comes up, the error
# is visible in the logs, and the app's own startup is defensive anyway.
# --proxy-headers + --forwarded-allow-ips: handle Railway's reverse proxy correctly
CMD sh -c "python -m alembic upgrade head || echo '[startup] WARNING: alembic upgrade head failed — starting API anyway (DB may be missing tables, check logs above)'; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"
