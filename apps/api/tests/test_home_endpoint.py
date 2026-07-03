"""Behavior of the aggregated Home read endpoint end to end (F1 slice 1).

``GET /api/home`` returns the standard envelope with ``{ readiness,
current_protocol }``: the user's Readiness computed server-side, and — in this
slice — a ``current_protocol`` that is always ``null`` (the protocol wiring lands
in slice 2). The profile and logged-session repositories are injected via
dependency overrides so the tests run offline; Readiness itself is exercised
exhaustively in ``test_readiness.py``, so here we verify the endpoint contract:
authentication, the envelope, and that the computed state reaches the payload."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class _Harness:
    def __init__(self, client, ctx, profiles):
        self.client = client
        self.ctx = ctx
        self.profiles = profiles

    def auth(self, sub):
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def fetch_home(self, sub):
        return self.client.get("/api/home", headers=self.auth(sub))


def build_harness(profiles=None) -> _Harness:
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    profiles = profiles or InMemoryProfileRepository()

    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return _Harness(TestClient(app), ctx, profiles)


def test_home_requires_authentication():
    h = build_harness()
    response = h.client.get("/api/home")
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_home_returns_readiness_and_a_null_current_protocol():
    # Arrange — a clean, unconstrained user with no logged history
    h = build_harness()

    # Act
    response = h.fetch_home("user_ready")

    # Assert — the standard envelope carries Ready and, this slice, no protocol
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"] == {"readiness": "READY", "current_protocol": None}


def test_a_sensitive_user_sees_extra_caution():
    # Arrange — the user carries a Sensitive Constraint
    profiles = InMemoryProfileRepository()
    profiles.update("user_sensitive", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(profiles=profiles)

    # Act
    data = h.fetch_home("user_sensitive").json()["data"]

    # Assert — the top of the precedence ladder reaches the payload
    assert data["readiness"] == "EXTRA_CAUTION"


def test_a_user_with_a_preference_sees_caution():
    # Arrange — a non-medical Preference / Limitation
    profiles = InMemoryProfileRepository()
    profiles.update("user_pref", ProfileUpdate(preferences=["no running"]))
    h = build_harness(profiles=profiles)

    # Act
    data = h.fetch_home("user_pref").json()["data"]

    # Assert
    assert data["readiness"] == "CAUTION"


def test_readiness_is_scoped_to_the_requesting_user():
    # Arrange — one sensitive user shares the app with an unconstrained one
    profiles = InMemoryProfileRepository()
    profiles.update("user_sensitive", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(profiles=profiles)

    # Act — a different, clean user reads Home
    data = h.fetch_home("user_clean").json()["data"]

    # Assert — the sensitive user's state does not leak across accounts
    assert data["readiness"] == "READY"
