# syntax=docker/dockerfile:1
FROM python:3.11-slim

# uv for fast, reproducible installs
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY pyproject.toml ./
RUN uv pip install --system .

COPY . .

EXPOSE 8000
CMD ["./docker-entrypoint.sh"]
