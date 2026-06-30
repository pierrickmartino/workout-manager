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


def full_payload(**overrides):
    payload = {
        "display_name": "Alex",
        "gender": "F",
        "age": 34,
        "height_cm": 170.0,
        "weight_kg": 65.5,
        "training_habits": "3x/week, mostly evenings",
        "default_equipment": ["dumbbells", "pull-up bar"],
        "recent_workout": "45 min upper-body session yesterday",
        "fitness_levels": {"strength": 8, "yoga": 2},
        "preferences": ["no running"],
        "sensitive_constraints": ["postpartum"],
    }
    payload.update(overrides)
    return payload


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


def test_onboarding_put_saves_full_profile_and_get_returns_it():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_onboard')}"}

    # Act — onboarding submits the full profile
    put = client.put("/api/profile", headers=headers, json=full_payload())
    fetched = client.get("/api/profile", headers=headers)

    # Assert — persisted and read back end to end
    assert put.status_code == 200
    body = fetched.json()
    assert body["success"] is True
    data = body["data"]
    assert data["age"] == 34
    assert data["default_equipment"] == ["dumbbells", "pull-up bar"]
    assert data["fitness_levels"] == {"strength": 8, "yoga": 2}
    assert data["preferences"] == ["no running"]
    assert data["sensitive_constraints"] == ["postpartum"]


def test_is_sensitive_is_derived_true_when_a_sensitive_type_is_present():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_sensitive')}"}

    # Act
    response = client.put(
        "/api/profile",
        headers=headers,
        json=full_payload(sensitive_constraints=["injury"]),
    )

    # Assert
    assert response.json()["data"]["is_sensitive"] is True


def test_is_sensitive_is_false_when_only_preferences_are_present():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_prefs_only')}"}

    # Act
    response = client.put(
        "/api/profile",
        headers=headers,
        json=full_payload(preferences=["no running"], sensitive_constraints=[]),
    )

    # Assert
    assert response.json()["data"]["is_sensitive"] is False


def test_profile_can_be_edited_later_and_changes_persist():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_edit')}"}
    client.put("/api/profile", headers=headers, json=full_payload())

    # Act — the user revises age, levels, and clears the sensitive constraint
    client.put(
        "/api/profile",
        headers=headers,
        json=full_payload(
            age=35, fitness_levels={"strength": 9}, sensitive_constraints=[]
        ),
    )
    reloaded = client.get("/api/profile", headers=headers).json()["data"]

    # Assert
    assert reloaded["age"] == 35
    assert reloaded["fitness_levels"] == {"strength": 9}
    assert reloaded["is_sensitive"] is False


def test_put_rejects_an_unknown_gender():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_badgender')}"}

    # Act
    response = client.put(
        "/api/profile", headers=headers, json=full_payload(gender="female")
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_put_accepts_a_valid_gender_and_round_trips_it():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_gender')}"}

    # Act
    client.put("/api/profile", headers=headers, json=full_payload(gender="F"))
    reloaded = client.get("/api/profile", headers=headers).json()["data"]

    # Assert
    assert reloaded["gender"] == "F"


def test_put_rejects_an_unknown_sensitive_constraint_type():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_badconstraint')}"}

    # Act
    response = client.put(
        "/api/profile",
        headers=headers,
        json=full_payload(sensitive_constraints=["not_a_real_type"]),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_put_rejects_a_fitness_level_out_of_range():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_badlevel')}"}

    # Act
    response = client.put(
        "/api/profile",
        headers=headers,
        json=full_payload(fitness_levels={"strength": 11}),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_put_requires_authentication():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.put("/api/profile", json=full_payload())

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False
