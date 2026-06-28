"""Behavior of GET /api/profile end to end: real JWKS verification, the
repository, and the response envelope wired through FastAPI. JWKS and the
repository are injected via dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.deps import get_profile_repository
from app.repositories.profile_repository import InMemoryProfileRepository
from tests.conftest import ISSUER, make_signing_context


def build_client(repo=None, ctx=None):
    ctx = ctx or make_signing_context()
    repo = repo or InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_profile_repository] = lambda: repo
    return TestClient(app), ctx, repo


def test_rejects_request_without_a_token():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.get("/api/profile")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_rejects_request_with_an_invalid_token():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.get(
        "/api/profile", headers={"Authorization": "Bearer not-a-real-token"}
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_creates_and_returns_profile_for_an_authenticated_user():
    # Arrange
    client, ctx, _ = build_client()
    token = ctx.mint(sub="user_authed")

    # Act
    response = client.get(
        "/api/profile", headers={"Authorization": f"Bearer {token}"}
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["clerk_user_id"] == "user_authed"
    assert body["data"]["display_name"] is None


def test_profile_round_trips_to_the_same_record_across_requests():
    # Arrange
    client, ctx, _ = build_client()
    token = ctx.mint(sub="user_roundtrip")
    headers = {"Authorization": f"Bearer {token}"}

    # Act
    first = client.get("/api/profile", headers=headers).json()
    second = client.get("/api/profile", headers=headers).json()

    # Assert
    assert first["data"]["id"] == second["data"]["id"]
    assert second["data"]["clerk_user_id"] == "user_roundtrip"
