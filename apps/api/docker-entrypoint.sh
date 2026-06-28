#!/usr/bin/env bash
# Apply database migrations, then start the API server.
set -euo pipefail

echo "Running database migrations..."
alembic upgrade head

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
