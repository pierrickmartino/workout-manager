"""Fetches and caches the Clerk JWKS document.

Kept separate from the verifier so the verifier stays a pure function and this
network-touching piece can be overridden in tests via FastAPI dependencies."""

from __future__ import annotations

import time

import httpx
from fastapi import Depends

from app.config import Settings, get_settings

_CACHE_TTL_SECONDS = 600
_cache: dict[str, object] = {"jwks": None, "fetched_at": 0.0}


def get_jwks(settings: Settings = Depends(get_settings)) -> dict:
    now = time.time()
    cached = _cache["jwks"]
    if cached is not None and now - float(_cache["fetched_at"]) < _CACHE_TTL_SECONDS:
        return cached  # type: ignore[return-value]

    response = httpx.get(settings.clerk_jwks_url, timeout=10.0)
    response.raise_for_status()
    jwks = response.json()
    _cache["jwks"] = jwks
    _cache["fetched_at"] = now
    return jwks
