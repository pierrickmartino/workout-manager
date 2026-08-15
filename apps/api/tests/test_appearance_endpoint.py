"""Behavior of GET/PUT /api/appearance end to end: real JWKS verification, the
repository, and the response envelope wired through FastAPI. JWKS and the
repository are injected via dependency overrides so the test runs offline.

The Appearance Preference is the per-user Mode, stored apart from the Fitness
Profile (ADR-0047). Prior art: tests/test_profile_endpoint.py (near-identical
shape)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.appearance_preference_repository import (
    InMemoryAppearancePreferenceRepository,
)
from app.repositories.deps import get_appearance_preference_repository
from tests.conftest import ISSUER, make_signing_context


def build_client(repo=None, ctx=None):
    ctx = ctx or make_signing_context()
    repo = repo or InMemoryAppearancePreferenceRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_appearance_preference_repository] = lambda: repo
    return TestClient(app), ctx, repo


def test_get_defaults_to_dark_when_no_record_exists():
    # Arrange — a brand-new user who has made no Appearance choice
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_default')}"}

    # Act
    response = client.get("/api/appearance", headers=headers)

    # Assert — the shipped default preserves today's all-dark look (ADR-0047)
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["mode"] == "dark"


def test_put_chosen_mode_round_trips_through_get():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_roundtrip')}"}

    # Act — the user picks Light, then reloads
    put = client.put("/api/appearance", headers=headers, json={"mode": "light"})
    fetched = client.get("/api/appearance", headers=headers)

    # Assert — the choice persisted and reads back end to end
    assert put.status_code == 200
    assert put.json()["success"] is True
    assert put.json()["data"]["mode"] == "light"
    assert fetched.json()["data"]["mode"] == "light"


def test_put_accepts_system_mode():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_system')}"}

    # Act
    client.put("/api/appearance", headers=headers, json={"mode": "system"})
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]

    # Assert — System is a valid stored choice; the client resolves the polarity
    assert reloaded["mode"] == "system"


def test_put_can_change_the_mode_again_and_the_change_persists():
    # Arrange — a user who first chose Light
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_change')}"}
    client.put("/api/appearance", headers=headers, json={"mode": "light"})

    # Act — later switches to Dark
    client.put("/api/appearance", headers=headers, json={"mode": "dark"})
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]

    # Assert
    assert reloaded["mode"] == "dark"


def test_put_rejects_an_unknown_mode():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_badmode')}"}

    # Act — an unknown Mode is a boundary validation error
    response = client.put(
        "/api/appearance", headers=headers, json={"mode": "sepia"}
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_get_rejects_a_request_without_a_token():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.get("/api/appearance")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_put_rejects_a_request_without_a_token():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.put("/api/appearance", json={"mode": "light"})

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_appearance_is_scoped_per_user():
    # Arrange — two users share one app; each has their own preference
    client, ctx, _ = build_client()
    alice = {"Authorization": f"Bearer {ctx.mint(sub='user_alice')}"}
    bob = {"Authorization": f"Bearer {ctx.mint(sub='user_bob')}"}

    # Act — Alice picks Light; Bob never chooses
    client.put("/api/appearance", headers=alice, json={"mode": "light"})

    # Assert — Bob still sees the default, unaffected by Alice
    assert client.get("/api/appearance", headers=alice).json()["data"]["mode"] == "light"
    assert client.get("/api/appearance", headers=bob).json()["data"]["mode"] == "dark"
