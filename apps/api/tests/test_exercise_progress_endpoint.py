"""Behavior of the per-exercise progress endpoint end to end: real JWKS
verification, the record-side repository, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

A user logs performances of a Session (Slice 4), then reads their progress on one
Exercise as an oldest-first time series of the sets they actually did. The view is
read-only over the record side and scoped to the owning user."""

from __future__ import annotations

from datetime import date

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


def _perform(sessions, logged, user, performed_on, load):
    session_view = sessions.create(
        user, SessionDraft(training_type="strength", duration_minutes=45,
                           prescriptions=[])
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[LoggedSetDraft(exercise_id=SQUAT, reps=5, load=load,
                                        perceived_difficulty=7)],
        ),
    )


def test_progress_returns_oldest_first_series_for_an_exercise():
    # Arrange — two squat performances on different dates
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_a", date(2026, 2, 1), "105kg")
    _perform(sessions, logged, "user_a", date(2026, 1, 1), "100kg")

    # Act
    response = client.get(f"/api/exercises/{SQUAT}/progress", headers=_auth(ctx, "user_a"))

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["exercise_id"] == SQUAT
    assert data["exercise_name"] == "Back Squat"
    assert [p["performed_on"] for p in data["points"]] == ["2026-01-01", "2026-02-01"]
    assert data["points"][0]["sets"][0]["load"] == "100kg"


def test_progress_is_empty_for_an_unperformed_exercise():
    # Arrange — the user has logged nothing
    client, ctx, _, _ = build_client()

    # Act
    response = client.get(f"/api/exercises/{SQUAT}/progress", headers=_auth(ctx, "user_b"))

    # Assert — an empty series, not an error
    assert response.status_code == 200
    assert response.json()["data"]["points"] == []


def test_progress_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get(f"/api/exercises/{SQUAT}/progress")

    # Assert
    assert response.status_code == 401
