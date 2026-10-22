"""Behavior of GET/PUT /api/avatar-universe end to end: real JWKS verification, the
repository and read-through cache, the admin gate, and the response envelope wired
through FastAPI, all injected so the test runs offline.

The Avatar Universe is a single global app-setting (ADR-0137): readable by any
authenticated user, published only by an admin (the ADR-0046 ``role=admin`` claim),
defaulting to The Realm. Prior art: tests/test_active_skin_endpoint.py."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.avatar_universe.cache import AvatarUniverseCache
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.avatar_universe_repository import (
    InMemoryAvatarUniverseRepository,
)
from app.repositories.deps import (
    get_avatar_universe_cache,
    get_avatar_universe_repository,
)
from tests.conftest import ISSUER, make_signing_context


def build_client():
    ctx = make_signing_context()
    repo = InMemoryAvatarUniverseRepository()
    # A fresh cache per client keeps tests isolated from the process-wide singleton.
    cache = AvatarUniverseCache()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_avatar_universe_repository] = lambda: repo
    app.dependency_overrides[get_avatar_universe_cache] = lambda: cache
    return TestClient(app), ctx, repo


def _user_headers(ctx, sub="user_reader"):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _admin_headers(ctx, sub="user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


def _read(client, ctx) -> str:
    return client.get("/api/avatar-universe", headers=_user_headers(ctx)).json()[
        "data"
    ]["universe"]


# --- GET: readable by any authenticated user, defaults to The Realm ---------


def test_get_defaults_to_the_realm():
    # Arrange
    client, ctx, _ = build_client()

    # Act
    response = client.get("/api/avatar-universe", headers=_user_headers(ctx))

    # Assert
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["universe"] == "realm"


def test_get_rejects_a_request_without_a_token():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.get("/api/avatar-universe")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


# --- PUT: admin publishes; the change is visible on GET at once -------------


def test_admin_publish_changes_what_every_user_reads_immediately():
    # Arrange — a user read warms the cache with The Realm
    client, ctx, _ = build_client()
    assert _read(client, ctx) == "realm"

    # Act — the admin publishes Orbit; publish invalidates the cache
    published = client.put(
        "/api/avatar-universe", headers=_admin_headers(ctx), json={"universe": "orbit"}
    )

    # Assert — the next read reflects it now, not after the TTL
    assert published.status_code == 200
    assert published.json()["data"]["universe"] == "orbit"
    assert _read(client, ctx) == "orbit"


def test_a_non_admin_cannot_publish():
    # Arrange
    client, ctx, repo = build_client()

    # Act
    response = client.put(
        "/api/avatar-universe", headers=_user_headers(ctx), json={"universe": "orbit"}
    )

    # Assert — refused, and the universe is untouched
    assert response.status_code == 403
    assert repo.get_avatar_universe() == "realm"


def test_publishing_an_unknown_universe_fails_closed():
    # Arrange — Olympus is the current universe
    client, ctx, repo = build_client()
    client.put(
        "/api/avatar-universe",
        headers=_admin_headers(ctx),
        json={"universe": "olympus"},
    )

    # Act
    response = client.put(
        "/api/avatar-universe",
        headers=_admin_headers(ctx),
        json={"universe": "atlantis"},
    )

    # Assert — a 422 naming the id, and Olympus still stands
    assert response.status_code == 422
    assert "atlantis" in response.json()["error"]
    assert repo.get_avatar_universe() == "olympus"
