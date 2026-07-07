"""Behavior of the Live Session hydration endpoint end to end (issue #90 — F2·S5).

``GET /api/sessions/{id}/live`` returns, for a Session the user owns, the Session
with progression-adjusted recommended loads plus each Exercise's previous
performance, in the standard envelope. Non-owners get ``404``. Real JWKS
verification and the response envelope are wired through FastAPI; the repositories
are injected via dependency overrides so the test runs offline."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.load import parse_load
from app.main import create_app
from app.repositories.deps import (
    get_logged_session_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context


def _seed_session(sessions, exercises, *, owner="user_owner"):
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.CURATED, targeted_muscles=["quads"]
    )
    view = sessions.create(
        owner,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(
                    exercise_id=squat.id,
                    sets=3,
                    reps="5",
                    recommended_load=parse_load("60 kg").to_dict(),
                )
            ],
        ),
    )
    return view, squat


def build_client(seed=None, ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    if seed is not None:
        seed(exercises, sessions, logged)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def test_live_hydration_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.get("/api/sessions/1/live")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_live_hydration_returns_progressed_loads_and_previous_performance():
    # Arrange — a strong prior performance should both raise the recommended load
    # and stand as the previous performance to beat.
    holder = {}

    def seed(exercises, sessions, logged):
        view, squat = _seed_session(sessions, exercises)
        logged.create(
            "user_owner",
            LoggedSessionDraft(
                session_id=view.id,
                performed_on=date(2026, 1, 1),
                logged_sets=[
                    LoggedSetDraft(
                        exercise_id=squat.id,
                        reps=5,
                        load=parse_load("60 kg").to_dict(),
                        perceived_difficulty=6,
                    )
                    for _ in range(3)
                ],
            ),
        )
        holder["session_id"] = view.id

    client, ctx = build_client(seed=seed)

    # Act
    response = client.get(
        f"/api/sessions/{holder['session_id']}/live", headers=_auth(ctx, "user_owner")
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    prescription = body["data"]["prescriptions"][0]
    # The load to lift today carries the ADR-0004 progression (60 → 62.5 kg)
    assert prescription["recommended_load"] == parse_load("62.5 kg").to_dict()
    # The previous performance to beat, aligned to the three current sets
    previous = prescription["previous_performance"]
    assert [s["reps"] for s in previous] == [5, 5, 5]
    assert previous[0]["load"] == parse_load("60 kg").to_dict()


def test_live_hydration_previous_performance_blank_when_never_logged():
    # Arrange — a fresh Session, nothing performed
    holder = {}

    def seed(exercises, sessions, logged):
        view, _ = _seed_session(sessions, exercises)
        holder["session_id"] = view.id

    client, ctx = build_client(seed=seed)

    # Act
    response = client.get(
        f"/api/sessions/{holder['session_id']}/live", headers=_auth(ctx, "user_owner")
    )

    # Assert — the load is untouched and there is no reference to beat
    prescription = response.json()["data"]["prescriptions"][0]
    assert prescription["recommended_load"] == parse_load("60 kg").to_dict()
    assert prescription["previous_performance"] == []


def test_another_user_cannot_hydrate_someone_elses_session():
    # Arrange
    holder = {}

    def seed(exercises, sessions, logged):
        view, _ = _seed_session(sessions, exercises, owner="user_owner")
        holder["session_id"] = view.id

    client, ctx = build_client(seed=seed)

    # Act — a different user requests the same session id
    response = client.get(
        f"/api/sessions/{holder['session_id']}/live",
        headers=_auth(ctx, "user_intruder"),
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False
