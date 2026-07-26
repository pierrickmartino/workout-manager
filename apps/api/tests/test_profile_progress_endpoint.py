"""Behavior of the Profile progress endpoint end to end (F5 Slice 1): real JWKS
verification, the record-side repository, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

``GET /api/profile/progress`` returns the honest Profile read model — the weekly
Streak and lifetime Total Sessions / Total Sets — scoped to the authenticated user.
A user who has logged nothing sees zeros, not an error; an unauthenticated request is
rejected. Mirrors ``test_analytics_endpoint.py``."""

from __future__ import annotations

from tests.quantities import reps_quantity

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
_WEEK = timedelta(days=7)


def _monday_of(day: date) -> date:
    """The ISO-week Monday of ``day`` — lets tests place a session squarely in the
    current week regardless of which weekday the suite happens to run on."""

    return day - timedelta(days=day.weekday())


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
    )
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
                LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)) for _ in range(set_count)
            ],
        ),
    )


def test_returns_streak_and_lifetime_counts_in_the_envelope():
    # Arrange — two sessions this week and last week, five sets in all
    client, ctx, sessions, logged = build_client()
    this_week = _monday_of(date.today())
    _perform(sessions, logged, "user_a", this_week, 3)
    _perform(sessions, logged, "user_a", this_week - _WEEK, 2)

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "user_a"))

    # Assert — the honest read model rides in the standard envelope
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    # The achievement wall serializes alongside; its shape is asserted on its own below.
    achievements = data.pop("achievements")
    # XP: two sessions of 3 + 2 sets = 2 * 100 + 5 * 10 = 250, landing inside Level 1.
    assert data == {
        "xp": 250,
        "level": {
            "level": 1,
            "xp_into_level": 250,
            "xp_span_of_level": 400,
            "xp_to_next": 150,
        },
        "streak": 2,
        "total_sessions": 2,
        "total_sets": 5,
    }
    # Two Logged Sessions is short of every threshold, so the wall is all locked.
    assert achievements and all(a["unlocked"] is False for a in achievements)


def test_empty_user_sees_zero_states_not_an_error():
    # Arrange — a brand-new user with no logged history
    client, ctx, _, _ = build_client()

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "newcomer"))

    # Assert — sensible zeros in a success envelope; 0 XP is Level 1 with an empty bar
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    achievements = data.pop("achievements")
    assert data == {
        "xp": 0,
        "level": {
            "level": 1,
            "xp_into_level": 0,
            "xp_span_of_level": 400,
            "xp_to_next": 400,
        },
        "streak": 0,
        "total_sessions": 0,
        "total_sets": 0,
    }
    # A brand-new user sees the whole catalog locked at 0 progress, no unlock dates.
    assert achievements
    assert all(
        a["unlocked"] is False and a["current"] == 0 and a["unlocked_on"] is None
        for a in achievements
    )


def test_projection_is_scoped_to_the_authenticated_user():
    # Arrange — another user's history must not leak into mine
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "theirs", date.today(), 9)

    # Act — I have logged nothing
    response = client.get("/api/profile/progress", headers=_auth(ctx, "mine"))

    # Assert — I see my own empty projection, not their sets
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["streak"] == 0
    assert data["total_sessions"] == 0
    assert data["total_sets"] == 0
    assert data["xp"] == 0
    assert data["level"]["level"] == 1


def test_serializes_an_unlocked_achievement_with_its_earned_date():
    # Arrange — five Logged Sessions unlock the 5-session badge; the fifth is dated
    client, ctx, sessions, logged = build_client()
    first_five = [date(2026, 6, 1) + timedelta(days=i) for i in range(5)]
    for day in first_five:
        _perform(sessions, logged, "user_e", day, 1)

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "user_e"))

    # Assert — the badge serializes with the full DTO shape, unlocked on the earliest
    # qualifying date
    assert response.status_code == 200
    achievements = response.json()["data"]["achievements"]
    by_id = {a["id"]: a for a in achievements}
    assert by_id["sessions-5"] == {
        "id": "sessions-5",
        "name": "5 Sessions",
        "criteria": "Log 5 Sessions",
        "unlocked": True,
        "current": 5,
        "target": 5,
        "unlocked_on": first_five[4].isoformat(),
    }
    # A still-locked badge carries live progress and no date.
    assert by_id["sessions-25"]["unlocked"] is False
    assert by_id["sessions-25"]["current"] == 5
    assert by_id["sessions-25"]["unlocked_on"] is None


def test_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get("/api/profile/progress")

    # Assert
    assert response.status_code == 401
