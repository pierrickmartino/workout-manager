"""Behavior of the Strength Analytics endpoint end to end: real JWKS verification, the
record-side repository, and the response envelope wired through FastAPI. Repositories are
injected via dependency overrides so tests run offline.

``GET /api/analytics/strength?limit&offset`` returns the standard envelope with the
all-time, all-Exercise Personal Record timeline (newest-first, paginated) and a
``has_qualifying_strength`` gate flag, scoped to the authenticated user. Pagination rides
in the envelope's ``meta``; an out-of-range pagination parameter is rejected in the same
error envelope. A user with no qualifying strength history reads a closed gate and an empty
timeline, not an error."""

from __future__ import annotations

from datetime import date, timedelta

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
PRESS = 2


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
    )
    exercises.find_or_create(
        "Overhead Press",
        provenance=Provenance.CURATED,
        targeted_muscles=["shoulders", "triceps"],
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


def test_strength_returns_the_newest_first_pr_timeline_and_open_gate():
    # Arrange — a 100 kg PR 200 days ago and a heavier 110 kg PR 100 days ago
    client, ctx, sessions, logged = build_client()
    _perform_pr(sessions, logged, "user_pr", date.today() - timedelta(days=200), 100.0)
    _perform_pr(sessions, logged, "user_pr", date.today() - timedelta(days=100), 110.0)

    # Act
    response = client.get("/api/analytics/strength", headers=_auth(ctx, "user_pr"))

    # Assert — the timeline rides in the envelope newest-first with the gate open
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["has_qualifying_strength"] is True
    assert data["records"] == [
        {
            "exercise": "Back Squat",
            "estimated_1rm": 110.0,
            "gain": 10.0,
            "date": (date.today() - timedelta(days=100)).isoformat(),
        },
        {
            "exercise": "Back Squat",
            "estimated_1rm": 100.0,
            "gain": 0.0,
            "date": (date.today() - timedelta(days=200)).isoformat(),
        },
    ]
    assert body["meta"] == {"total": 2, "limit": 20, "offset": 0}


def test_strength_paginates_the_timeline_via_limit_and_offset():
    # Arrange — three ascending PRs on distinct days (newest is heaviest)
    client, ctx, sessions, logged = build_client()
    _perform_pr(sessions, logged, "user_pg", date.today() - timedelta(days=3), 100.0)
    _perform_pr(sessions, logged, "user_pg", date.today() - timedelta(days=2), 110.0)
    _perform_pr(sessions, logged, "user_pg", date.today() - timedelta(days=1), 120.0)

    # Act — the second page of one record
    response = client.get(
        "/api/analytics/strength?limit=1&offset=1", headers=_auth(ctx, "user_pg")
    )

    # Assert — the middle record only, with the honest full total in meta
    assert response.status_code == 200
    body = response.json()
    assert [r["estimated_1rm"] for r in body["data"]["records"]] == [110.0]
    assert body["meta"] == {"total": 3, "limit": 1, "offset": 1}


def test_strength_rejects_an_out_of_range_limit_in_the_error_envelope():
    # Arrange
    client, ctx, _, _ = build_client()

    # Act — a page size beyond the cap
    response = client.get(
        "/api/analytics/strength?limit=999", headers=_auth(ctx, "user_x")
    )

    # Assert — validation failure surfaced through the standard error envelope
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error"]


def test_strength_rejects_a_negative_offset_in_the_error_envelope():
    # Arrange
    client, ctx, _, _ = build_client()

    # Act
    response = client.get(
        "/api/analytics/strength?offset=-1", headers=_auth(ctx, "user_x")
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_strength_empty_state_is_a_closed_gate_not_an_error():
    # Arrange — the user has logged nothing
    client, ctx, _, _ = build_client()

    # Act
    response = client.get("/api/analytics/strength", headers=_auth(ctx, "user_none"))

    # Assert — a clear closed-gate read model, not an error
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {
        "has_qualifying_strength": False,
        "records": [],
        "trajectories": [],
    }
    assert body["meta"] == {"total": 0, "limit": 20, "offset": 0}


def test_strength_is_scoped_to_the_requesting_user():
    # Arrange — another user holds a PR; the requester holds none
    client, ctx, sessions, logged = build_client()
    _perform_pr(sessions, logged, "user_them", date.today() - timedelta(days=5), 200.0)

    # Act — the requester reads their own (empty) strength history
    response = client.get("/api/analytics/strength", headers=_auth(ctx, "user_me"))

    # Assert — none of the other user's records leak through
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["records"] == []
    assert data["has_qualifying_strength"] is False


def test_strength_serializes_ranked_trajectories_in_the_envelope():
    # Arrange — the squat is trained twice, the press once
    client, ctx, sessions, logged = build_client()

    def _log(user, performed_on, sets):
        session_view = sessions.create(
            user,
            SessionDraft(
                training_type="strength", duration_minutes=45, prescriptions=[]
            ),
        )
        logged.create(
            user,
            LoggedSessionDraft(
                session_id=session_view.id, performed_on=performed_on, logged_sets=sets
            ),
        )

    def _abs(kg):
        return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()

    _log(
        "user_traj",
        date.today() - timedelta(days=10),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(100.0)),
            LoggedSetDraft(exercise_id=PRESS, reps=1, load=_abs(60.0)),
        ],
    )
    _log(
        "user_traj",
        date.today() - timedelta(days=3),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(110.0))],
    )

    # Act
    response = client.get("/api/analytics/strength", headers=_auth(ctx, "user_traj"))

    # Assert — the small-multiples ride in the envelope, most-frequent first, each with
    # its oldest-first Top-Set series of {date, estimated_1rm}
    assert response.status_code == 200
    assert response.json()["data"]["trajectories"] == [
        {
            "exercise_id": SQUAT,
            "exercise": "Back Squat",
            "series": [
                {
                    "date": (date.today() - timedelta(days=10)).isoformat(),
                    "estimated_1rm": 100.0,
                },
                {
                    "date": (date.today() - timedelta(days=3)).isoformat(),
                    "estimated_1rm": 110.0,
                },
            ],
        },
        {
            "exercise_id": PRESS,
            "exercise": "Overhead Press",
            "series": [
                {
                    "date": (date.today() - timedelta(days=10)).isoformat(),
                    "estimated_1rm": 60.0,
                },
            ],
        },
    ]


def test_strength_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get("/api/analytics/strength")

    # Assert
    assert response.status_code == 401
