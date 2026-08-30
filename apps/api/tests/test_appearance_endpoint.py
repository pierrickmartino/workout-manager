"""Behavior of GET/PUT /api/appearance end to end: real JWKS verification, the
repository, and the response envelope wired through FastAPI. JWKS and the
repository are injected via dependency overrides so the test runs offline.

The store holds the per-user Interface Preference — Mode + Keep Screen Awake
(ADR-0055) — kept apart from the Fitness Profile (ADR-0047). Prior art:
tests/test_profile_endpoint.py (near-identical shape)."""

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


def test_get_defaults_to_dark_and_awake_when_no_record_exists():
    # Arrange — a brand-new user who has made no Appearance choice
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_default')}"}

    # Act
    response = client.get("/api/appearance", headers=headers)

    # Assert — the shipped defaults: today's all-dark look (ADR-0047) and Keep
    # Screen Awake on (ADR-0055)
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["mode"] == "dark"
    assert body["data"]["keep_screen_awake"] is True
    assert body["data"]["weight_unit"] == "kg"


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

    # Act — Alice picks Light + Keep Screen Awake off; Bob never chooses
    client.put(
        "/api/appearance",
        headers=alice,
        json={"mode": "light", "keep_screen_awake": False},
    )

    # Assert — Bob still sees the shipped defaults, unaffected by Alice
    alice_data = client.get("/api/appearance", headers=alice).json()["data"]
    bob_data = client.get("/api/appearance", headers=bob).json()["data"]
    assert alice_data == {
        "mode": "light",
        "keep_screen_awake": False,
        "weight_unit": "kg",
    }
    assert bob_data == {
        "mode": "dark",
        "keep_screen_awake": True,
        "weight_unit": "kg",
    }


def test_put_keep_screen_awake_off_round_trips_through_get():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_awake')}"}

    # Act — the battery-conscious user turns Keep Screen Awake off, then reloads
    put = client.put(
        "/api/appearance", headers=headers, json={"keep_screen_awake": False}
    )
    fetched = client.get("/api/appearance", headers=headers)

    # Assert — the choice persisted end to end; Mode is left at its default
    assert put.status_code == 200
    assert put.json()["data"] == {
        "mode": "dark",
        "keep_screen_awake": False,
        "weight_unit": "kg",
    }
    assert fetched.json()["data"] == {
        "mode": "dark",
        "keep_screen_awake": False,
        "weight_unit": "kg",
    }


def test_mode_and_keep_screen_awake_are_independently_settable():
    # Arrange — a user turns Keep Screen Awake off (Mode untouched)
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_facets')}"}
    client.put("/api/appearance", headers=headers, json={"keep_screen_awake": False})

    # Act — later picks Light, sending only the Mode facet
    client.put("/api/appearance", headers=headers, json={"mode": "light"})
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]

    # Assert — each facet saved independently; neither reset the other
    assert reloaded == {
        "mode": "light",
        "keep_screen_awake": False,
        "weight_unit": "kg",
    }


def test_put_rejects_an_ill_typed_keep_screen_awake_and_does_not_persist_it():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_badawake')}"}

    # Act — a non-boolean is a boundary validation error
    response = client.put(
        "/api/appearance", headers=headers, json={"keep_screen_awake": "sometimes"}
    )

    # Assert — 422 and nothing persisted, so the user keeps the shipped defaults
    assert response.status_code == 422
    assert response.json()["success"] is False
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]
    assert reloaded == {
        "mode": "dark",
        "keep_screen_awake": True,
        "weight_unit": "kg",
    }


def test_get_defaults_weight_unit_to_kg_when_no_record_exists():
    # Arrange — a brand-new user who has made no Weight Unit choice
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_wu_default')}"}

    # Act
    data = client.get("/api/appearance", headers=headers).json()["data"]

    # Assert — the shipped default is kilograms (CONTEXT "Weight Unit")
    assert data["weight_unit"] == "kg"


def test_put_weight_unit_lb_round_trips_through_get():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_wu_lb')}"}

    # Act — a pounds user picks lb, then reloads
    put = client.put(
        "/api/appearance", headers=headers, json={"weight_unit": "lb"}
    )
    fetched = client.get("/api/appearance", headers=headers)

    # Assert — the choice persisted end to end; the other facets keep their defaults
    assert put.status_code == 200
    assert put.json()["data"] == {
        "mode": "dark",
        "keep_screen_awake": True,
        "weight_unit": "lb",
    }
    assert fetched.json()["data"]["weight_unit"] == "lb"


def test_weight_unit_is_settable_without_disturbing_mode_or_keep_screen_awake():
    # Arrange — a user first sets Light + Keep Screen Awake off (Weight Unit untouched)
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_wu_facets')}"}
    client.put(
        "/api/appearance",
        headers=headers,
        json={"mode": "light", "keep_screen_awake": False},
    )

    # Act — later switches to pounds, sending only the Weight Unit facet
    client.put("/api/appearance", headers=headers, json={"weight_unit": "lb"})
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]

    # Assert — Weight Unit changed; Mode and Keep Screen Awake are untouched
    assert reloaded == {
        "mode": "light",
        "keep_screen_awake": False,
        "weight_unit": "lb",
    }


def test_mode_change_does_not_disturb_a_chosen_weight_unit():
    # Arrange — a pounds user
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_wu_mode')}"}
    client.put("/api/appearance", headers=headers, json={"weight_unit": "lb"})

    # Act — later picks Light, sending only the Mode facet
    client.put("/api/appearance", headers=headers, json={"mode": "light"})
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]

    # Assert — the pounds choice survives a Mode change (and vice-versa)
    assert reloaded == {
        "mode": "light",
        "keep_screen_awake": True,
        "weight_unit": "lb",
    }


def test_put_rejects_an_unknown_weight_unit_and_does_not_persist_it():
    # Arrange
    client, ctx, _ = build_client()
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_wu_bad')}"}

    # Act — an unknown unit is a boundary validation error
    response = client.put(
        "/api/appearance", headers=headers, json={"weight_unit": "stone"}
    )

    # Assert — 422 and nothing persisted, so the user keeps the shipped kg default
    assert response.status_code == 422
    assert response.json()["success"] is False
    reloaded = client.get("/api/appearance", headers=headers).json()["data"]
    assert reloaded["weight_unit"] == "kg"
