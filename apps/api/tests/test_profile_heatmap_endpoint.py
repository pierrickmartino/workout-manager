"""Behavior of the Profile Training Heatmap endpoint end to end (#378, ADR-0054): real
JWKS verification, the record-side repository, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

``GET /api/profile/heatmap`` returns the trailing ~53-week grid of dated, fixed-shade
cells plus the legend scale, scoped to the authenticated user. A user who has logged
nothing sees an all-neutral full-width frame, not an error; an unauthenticated request is
rejected. Mirrors ``test_profile_progress_endpoint.py``."""

from __future__ import annotations

from tests.quantities import reps_quantity

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.heatmap import WINDOW_WEEKS
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
CELLS_IN_WINDOW = WINDOW_WEEKS * 7


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


def _perform(sessions, logged, user, performed_on, set_count, *, session_id=None):
    if session_id is None:
        session_view = sessions.create(
            user,
            SessionDraft(
                training_type="strength", duration_minutes=45, prescriptions=[]
            ),
        )
        session_id = session_view.id
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=performed_on,
            logged_sets=[
                LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))
                for _ in range(set_count)
            ],
        ),
    )


def _cell_for(cells, iso_date):
    return next(cell for cell in cells if cell["date"] == iso_date)


def test_returns_the_shaded_grid_and_legend_scale_in_the_envelope():
    # Arrange — eight sets this week (bucket 6–12 -> level 2)
    client, ctx, sessions, logged = build_client()
    this_week = _monday_of(date.today())
    _perform(sessions, logged, "user_a", this_week, 8)

    # Act
    response = client.get("/api/profile/heatmap", headers=_auth(ctx, "user_a"))

    # Assert — the mosaic rides in the standard envelope, full-width, correctly shaded
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    assert len(data["cells"]) == CELLS_IN_WINDOW
    cell = _cell_for(data["cells"], this_week.isoformat())
    assert cell["session_count"] == 1
    assert cell["set_count"] == 8
    assert cell["level"] == 2
    # The fixed legend scale rides alongside so the client never hardcodes thresholds.
    assert data["scale"] == [
        {"level": 0, "min_sets": 0},
        {"level": 1, "min_sets": 1},
        {"level": 2, "min_sets": 6},
        {"level": 3, "min_sets": 13},
        {"level": 4, "min_sets": 21},
    ]


def test_empty_user_sees_an_all_neutral_full_width_frame_not_an_error():
    # Arrange — a brand-new user with no logged history
    client, ctx, _, _ = build_client()

    # Act
    response = client.get("/api/profile/heatmap", headers=_auth(ctx, "newcomer"))

    # Assert — the full frame, every cell neutral and empty; never an error, never a
    # jumping width
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    cells = body["data"]["cells"]
    assert len(cells) == CELLS_IN_WINDOW
    assert all(cell["level"] == 0 for cell in cells)
    assert all(
        cell["session_count"] == 0 and cell["set_count"] == 0 for cell in cells
    )


def test_multiple_sessions_on_a_day_sum_their_sets_across_plan_origins():
    # Arrange — a plan-backed and a plan-less log on the same day: 3 + 4 = 7 sets -> level 2
    client, ctx, sessions, logged = build_client()
    day = _monday_of(date.today())
    _perform(sessions, logged, "user_m", day, 3)  # plan-backed
    _perform(sessions, logged, "user_m", day, 4, session_id=None)  # counts identically

    # Act
    response = client.get("/api/profile/heatmap", headers=_auth(ctx, "user_m"))

    # Assert
    cell = _cell_for(response.json()["data"]["cells"], day.isoformat())
    assert cell["session_count"] == 2
    assert cell["set_count"] == 7
    assert cell["level"] == 2


def test_projection_is_scoped_to_the_authenticated_user():
    # Arrange — another user's history must not leak into mine
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "theirs", _monday_of(date.today()), 20)

    # Act — I have logged nothing
    response = client.get("/api/profile/heatmap", headers=_auth(ctx, "mine"))

    # Assert — I see my own all-neutral projection, not their sets
    assert response.status_code == 200
    cells = response.json()["data"]["cells"]
    assert all(cell["level"] == 0 for cell in cells)


def test_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get("/api/profile/heatmap")

    # Assert
    assert response.status_code == 401
