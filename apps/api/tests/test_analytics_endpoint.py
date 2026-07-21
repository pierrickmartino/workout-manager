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
from app.domain.load import LoadKind, ParsedLoad
from app.main import create_app
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context

SQUAT = 1


def build_client(ctx=None, profiles=None):
    ctx = ctx or make_signing_context()
    profiles = profiles or InMemoryProfileRepository()
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
    app.dependency_overrides[get_profile_repository] = lambda: profiles
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


def _perform_pr(sessions, logged, user, performed_on, kg):
    """Log a single absolute-load Squat single that can set a Personal Record."""

    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    load = ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[LoggedSetDraft(exercise_id=SQUAT, reps=1, load=load)],
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


def test_analytics_serializes_the_muscle_distribution():
    # Arrange — three Back Squat sets today; the Exercise trains only Legs
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_dist", date.today(), 3)

    # Act
    response = client.get("/api/analytics?range=7d", headers=_auth(ctx, "user_dist"))

    # Assert — the distribution rides in the envelope as ordered group/pct pairs
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["muscle_distribution"] == [{"group": "Legs", "pct": 100.0}]


def test_analytics_serializes_the_six_group_coverage_in_canonical_order():
    # Arrange — three Back Squat sets today; the Exercise trains only Legs. Coverage reads
    # its own fixed 8-week window, so the recent work covers Legs and nothing else.
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_cov", date.today(), 3)

    # Act
    response = client.get("/api/analytics?range=7d", headers=_auth(ctx, "user_cov"))

    # Assert — the six real groups ride in the envelope in canonical order, each with a
    # covered boolean, under a labeled 8-week window; Legs is the only one trained
    assert response.status_code == 200
    coverage = response.json()["data"]["coverage"]
    assert coverage["weeks"] == 8
    assert coverage["groups"] == [
        {"group": "Legs", "covered": True},
        {"group": "Chest", "covered": False},
        {"group": "Back", "covered": False},
        {"group": "Shoulders", "covered": False},
        {"group": "Arms", "covered": False},
        {"group": "Core", "covered": False},
    ]
    # All the recent work maps to a real group, so nothing sits outside the six
    assert coverage["unclassified_present"] is False


def test_analytics_discloses_in_window_unclassified_work_in_the_envelope():
    # Arrange — an Exercise whose muscles the curated map doesn't know: its recent sets
    # roll up to Unclassified, so the envelope must disclose the work outside the six.
    client, ctx, sessions, logged = build_client()
    mystery = logged._exercises.find_or_create(
        "Aerial Silks",
        provenance=Provenance.CURATED,
        targeted_muscles=["unobtainium"],
    )
    session_view = sessions.create(
        "user_unc",
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        "user_unc",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date.today(),
            logged_sets=[LoggedSetDraft(exercise_id=mystery.id, reps=5)],
        ),
    )

    # Act
    response = client.get("/api/analytics?range=7d", headers=_auth(ctx, "user_unc"))

    # Assert — the six real groups stay honest (all not-trained) while the envelope
    # discloses that in-window work fell outside them; Unclassified is never a group row
    assert response.status_code == 200
    coverage = response.json()["data"]["coverage"]
    assert all(row["covered"] is False for row in coverage["groups"])
    assert [row["group"] for row in coverage["groups"]] == [
        "Legs",
        "Chest",
        "Back",
        "Shoulders",
        "Arms",
        "Core",
    ]
    assert coverage["unclassified_present"] is True


def test_analytics_serializes_the_recent_records_feed_and_new_prs_tile():
    # Arrange — a 100 kg PR 40 days ago (outside 30d) and a heavier 110 kg PR 2 days
    # ago (inside 30d)
    client, ctx, sessions, logged = build_client()
    _perform_pr(sessions, logged, "user_pr", date.today() - timedelta(days=40), 100.0)
    _perform_pr(sessions, logged, "user_pr", date.today() - timedelta(days=2), 110.0)

    # Act
    response = client.get("/api/analytics?range=30d", headers=_auth(ctx, "user_pr"))

    # Assert — the feed rides in the envelope newest-first, decoupled from the window;
    # new_prs counts only the in-window record
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["new_prs"] == 1
    assert data["recent_records"] == [
        {
            "exercise": "Back Squat",
            "estimated_1rm": 110.0,
            "gain": 10.0,
            "date": (date.today() - timedelta(days=2)).isoformat(),
            "reps": 1,
            "is_bodyweight": False,
            "added_kg": None,
        },
        {
            "exercise": "Back Squat",
            "estimated_1rm": 100.0,
            "gain": 0.0,
            "date": (date.today() - timedelta(days=40)).isoformat(),
            "reps": 1,
            "is_bodyweight": False,
            "added_kg": None,
        },
    ]


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
        "muscle_distribution": [],
        "recent_records": [],
        "new_prs": 0,
        "volume": {"points": [], "coverage": 0.0, "delta": None},
        "coverage": {
            "weeks": 8,
            "groups": [
                {"group": "Legs", "covered": False},
                {"group": "Chest", "covered": False},
                {"group": "Back", "covered": False},
                {"group": "Shoulders", "covered": False},
                {"group": "Arms", "covered": False},
                {"group": "Core", "covered": False},
            ],
            "unclassified_present": False,
        },
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


def _perform_load(sessions, logged, user, performed_on, kg, reps):
    """Log a single absolute-load Squat set of ``reps`` at ``kg`` (volume tests)."""

    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    load = ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[LoggedSetDraft(exercise_id=SQUAT, reps=reps, load=load)],
        ),
    )


def test_analytics_serializes_the_daily_volume_series():
    # Arrange — 100kg×5 today (inside 7d) and 80kg×5 eight days ago (prior 7d window)
    client, ctx, sessions, logged = build_client()
    _perform_load(sessions, logged, "user_vol", date.today(), 100.0, 5)
    _perform_load(
        sessions, logged, "user_vol", date.today() - timedelta(days=8), 80.0, 5
    )

    # Act
    response = client.get("/api/analytics?range=7d", headers=_auth(ctx, "user_vol"))

    # Assert — the daily points, coverage, and equal-window delta ride in the envelope
    assert response.status_code == 200
    volume = response.json()["data"]["volume"]
    assert volume["points"] == [
        {"date": date.today().isoformat(), "volume_kg": 500.0},
    ]
    assert volume["coverage"] == 100.0
    # this window's 500 kg vs the prior window's 400 kg → +25%
    assert volume["delta"] == 25.0


def _perform_bodyweight(sessions, logged, user, performed_on, reps):
    """Log a single plain-bodyweight Squat set of ``reps`` (volume tests)."""

    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    load = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[LoggedSetDraft(exercise_id=SQUAT, reps=reps, load=load)],
        ),
    )


def test_analytics_folds_bodyweight_volume_using_the_recorded_body_weight():
    # Arrange — a recorded 70 kg body weight and a plain bodyweight set of 10 reps
    profiles = InMemoryProfileRepository()
    profiles.update("user_bw", ProfileUpdate(weight_kg=70.0))
    client, ctx, sessions, logged = build_client(profiles=profiles)
    _perform_bodyweight(sessions, logged, "user_bw", date.today(), 10)

    # Act
    response = client.get("/api/analytics?range=7d", headers=_auth(ctx, "user_bw"))

    # Assert — the body weight resolves the set end to end: 10 × 70 = 700, fully covered
    assert response.status_code == 200
    volume = response.json()["data"]["volume"]
    assert volume["points"] == [
        {"date": date.today().isoformat(), "volume_kg": 700.0},
    ]
    assert volume["coverage"] == 100.0
