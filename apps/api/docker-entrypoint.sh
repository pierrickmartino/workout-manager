#!/usr/bin/env bash
# Apply database migrations, then start the API server.
set -euo pipefail

echo "Running database migrations..."
alembic upgrade head

echo "Starting API server..."
# Bind the IPv6 wildcard (dual-stack) rather than 0.0.0.0. On Linux with the
# default IPV6_V6ONLY=0, a `::` socket also accepts IPv4 (v4-mapped), so this
# keeps Docker Compose service-to-service (IPv4) working while making the API
# reachable over Railway's private network, which is IPv6-only.
exec uvicorn app.main:app --host :: --port 8000
