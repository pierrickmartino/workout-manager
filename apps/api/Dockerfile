# syntax=docker/dockerfile:1
FROM python:3.11-slim

# uv for fast, reproducible installs. Pinned by tag and digest (not :latest) so
# the build tool can't drift between builds; bump both together.
COPY --from=ghcr.io/astral-sh/uv:0.12.23@sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21 /uv /usr/local/bin/uv

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
