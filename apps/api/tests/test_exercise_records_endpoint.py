"""Behavior of the per-exercise records endpoint end to end (F6 Slice 2): real JWKS
verification, the record-side repository, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

A user logs performances of a Session, then reads the stat-header figures for one
Exercise — the Personal Record (highest Estimated 1RM) and Total Sets — under the
standard success envelope. The read is scoped to the owning user, and the Personal
Record is hidden (``None``) for a movement with no absolute-Load history."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
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
PUSHUP = 2


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    exercises.find_or_create("Push-up", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return TestClient(app), ctx, sessions, logged


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _absolute(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _perform(sessions, logged, user, exercise_id, performed_on, reps, load):
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
                LoggedSetDraft(exercise_id=exercise_id, reps=reps, load=load)
            ],
        ),
    )


def test_records_endpoint_returns_pr_and_total_sets_under_the_envelope():
    # Arrange — two squat singles on different dates, the newer heavier
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_a", SQUAT, date(2026, 1, 1), 1, _absolute(100.0))
    _perform(sessions, logged, "user_a", SQUAT, date(2026, 2, 1), 1, _absolute(110.0))

    # Act
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_a")
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["exercise_id"] == SQUAT
    assert data["exercise_name"] == "Back Squat"
    assert data["personal_record"] == 110.0
    assert data["total_sets"] == 2


def test_records_endpoint_returns_the_top_set_series_oldest_first():
    # Arrange — two qualifying squat sessions, the newer heavier
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_ts", SQUAT, date(2026, 1, 1), 1, _absolute(100.0))
    _perform(sessions, logged, "user_ts", SQUAT, date(2026, 1, 8), 1, _absolute(120.0))

    # Act
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_ts")
    )

    # Assert — the series rides the envelope, oldest-first, dates ISO-serialized
    assert response.status_code == 200
    series = response.json()["data"]["top_set_series"]
    assert series == [
        {"date": "2026-01-01", "estimated_1rm": 100.0},
        {"date": "2026-01-08", "estimated_1rm": 120.0},
    ]


def test_records_endpoint_returns_an_empty_series_for_a_non_absolute_exercise():
    # Arrange — a bodyweight push-up has no qualifying Top Set
    client, ctx, sessions, logged = build_client()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _perform(sessions, logged, "user_bw", PUSHUP, date(2026, 1, 1), 12, bodyweight)

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_bw")
    )

    # Assert — an honest empty series (no chart), never a fabricated zero bar
    assert response.status_code == 200
    assert response.json()["data"]["top_set_series"] == []


def test_records_endpoint_hides_personal_record_for_a_non_absolute_exercise():
    # Arrange — a bodyweight push-up: no comparable Estimated 1RM
    client, ctx, sessions, logged = build_client()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _perform(sessions, logged, "user_b", PUSHUP, date(2026, 1, 1), 12, bodyweight)

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_b")
    )

    # Assert — PR is null (tile hidden, not zeroed), but Total Sets still renders
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["personal_record"] is None
    assert data["total_sets"] == 1


def test_records_endpoint_is_scoped_to_the_authenticated_user():
    # Arrange — another user's heavier squat must not leak into mine
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_them", SQUAT, date(2026, 1, 1), 1, _absolute(200.0))

    # Act — I have logged nothing
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_me")
    )

    # Assert — an honest empty read, not the other user's record
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["personal_record"] is None
    assert data["total_sets"] == 0


def test_records_endpoint_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get(f"/api/exercises/{SQUAT}/records")

    # Assert
    assert response.status_code == 401
