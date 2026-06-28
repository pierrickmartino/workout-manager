"""Behavior of the JWKS provider: it fetches the document and caches it so a
burst of requests doesn't hammer Clerk's JWKS endpoint."""

from __future__ import annotations

import app.auth.jwks_provider as provider
from app.config import Settings


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def test_fetches_once_and_serves_subsequent_calls_from_cache(monkeypatch):
    # Arrange
    provider._cache["jwks"] = None
    provider._cache["fetched_at"] = 0.0
    calls = {"count": 0}

    def fake_get(url, timeout):  # noqa: ANN001
        calls["count"] += 1
        return _FakeResponse({"keys": [{"kid": "k1"}]})

    monkeypatch.setattr(provider.httpx, "get", fake_get)
    settings = Settings(clerk_jwks_url="https://clerk.example/.well-known/jwks.json")

    # Act
    first = provider.get_jwks(settings)
    second = provider.get_jwks(settings)

    # Assert
    assert first == second == {"keys": [{"kid": "k1"}]}
    assert calls["count"] == 1
