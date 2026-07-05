"""Behavior of the Analytics endpoint end to end: real JWKS verification, the
record-side repository, and the response envelope wired through FastAPI.
Repositories are injected via dependency overrides so tests run offline.

``GET /api/analytics?range=7d|30d|90d`` returns the honest count read model —
sessions, active days, total sets — scoped to the authenticated user and to the
selected rolling window. A user who has logged nothing sees zero counts, not an
error; an unknown range is rejected in the standard error envelope."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import get_logged_session_repository
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context

SQUAT = 1


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return TestClient(app), ctx, sessions, logged


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _perform(sessions, logged, user, performed_on, set_count):
    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[
                LoggedSetDraft(exercise_id=SQUAT, reps=5) for _ in range(set_count)
            ],
        ),
    )


def test_analytics_returns_range_scoped_counts_in_the_envelope():
    # Arrange — two recent performances (today, yesterday) totalling five sets
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_a", date.today(), 3)
    _perform(sessions, logged, "user_a", date.today() - timedelta(days=1), 2)

    # Act
    response = client.get("/api/analytics?range=7d", headers=_auth(ctx, "user_a"))

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["range"] == "7d"
    assert data["sessions"] == 2
    assert data["active_days"] == 2
    assert data["total_sets"] == 5


def test_analytics_empty_state_is_zero_counts_not_an_error():
    # Arrange — the user has logged nothing
    client, ctx, _, _ = build_client()

    # Act
    response = client.get("/api/analytics?range=30d", headers=_auth(ctx, "user_b"))

    # Assert — a clear empty read model, not an error
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {
        "range": "30d",
        "sessions": 0,
        "active_days": 0,
        "total_sets": 0,
    }


def test_analytics_defaults_to_the_seven_day_window():
    # Arrange — no range supplied
    client, ctx, _, _ = build_client()

    # Act
    response = client.get("/api/analytics", headers=_auth(ctx, "user_c"))

    # Assert
    assert response.status_code == 200
    assert response.json()["data"]["range"] == "7d"


def test_analytics_rejects_an_unknown_range_in_the_error_envelope():
    # Arrange
    client, ctx, _, _ = build_client()

    # Act — a range value outside 7d / 30d / 90d
    response = client.get("/api/analytics?range=1y", headers=_auth(ctx, "user_d"))

    # Assert — validation failure surfaced through the standard envelope
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error"]


def test_analytics_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get("/api/analytics?range=7d")

    # Assert
    assert response.status_code == 401
