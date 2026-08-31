"""The Delete endpoint end to end (ADR-0063): real JWKS verification, the repositories, and
the response envelope wired through FastAPI, with the repositories injected via dependency
overrides so the tests run offline.

``DELETE /api/sessions/{id}`` permanently removes the caller's own standalone Session — but
only when it has no Logged Session (a performed plan is settled record). It is standalone-only
(``409`` on a Protocol member), owner-scoped (``404`` for a non-owner), and refused with
``409`` once any performance exists. The read-time **Logged Count** it guards on is surfaced on
both the list rows and the detail read.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_feedback_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
    get_share_link_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.favorite_repository import InMemoryFavoriteRepository
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from app.repositories.share_link_repository import InMemoryShareLinkRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5", rest_seconds=120
                ),
            ]
        )


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    profiles = InMemoryProfileRepository()
    favorites = InMemoryFavoriteRepository()
    sessions = InMemorySessionRepository(exercises, profiles, favorites)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    shares = InMemoryShareLinkRepository()
    feedback = InMemoryGenerationFeedbackRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_share_link_repository] = lambda: shares
    app.dependency_overrides[get_generation_feedback_repository] = lambda: feedback
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx, sessions, logged


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def _log_against(logged, user, session_id, *, outcome="completed"):
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=date(2026, 1, 1),
            training_type="strength",
            completion_outcome=outcome,
            logged_sets=[LoggedSetDraft(exercise_id=1)],
        ),
    )


def test_delete_requires_authentication():
    client, _, _, _ = build_client()
    assert client.delete("/api/sessions/1").status_code == 401


def test_deletes_an_unperformed_session():
    # Arrange
    client, ctx, _, _ = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)

    # Act
    deleted = client.delete(f"/api/sessions/{session['id']}", headers=headers)

    # Assert — the delete succeeds and a fresh read 404s (the Session is gone)
    assert deleted.status_code == 200
    assert deleted.json()["data"] == {"id": session["id"]}
    reread = client.get(f"/api/sessions/{session['id']}", headers=headers)
    assert reread.status_code == 404


def test_deleted_session_leaves_the_library():
    client, ctx, _, _ = build_client()
    headers = _auth(ctx, "user_a")
    keep = _create_session(client, headers)
    drop = _create_session(client, headers)

    client.delete(f"/api/sessions/{drop['id']}", headers=headers)

    ids = [row["id"] for row in client.get("/api/sessions", headers=headers).json()["data"]]
    assert ids == [keep["id"]]


def test_409_when_the_session_has_a_logged_performance():
    # Arrange — a Session with one Incomplete performance is still undeletable.
    client, ctx, _, logged = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)
    _log_against(logged, "user_a", session["id"], outcome="incomplete")

    # Act
    deleted = client.delete(f"/api/sessions/{session['id']}", headers=headers)

    # Assert — refused, and the Session survives
    assert deleted.status_code == 409
    assert client.get(f"/api/sessions/{session['id']}", headers=headers).status_code == 200


def test_409_on_a_protocol_member_session():
    client, ctx, sessions, _ = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)
    sessions._sessions[session["id"]].protocol_id = 999

    deleted = client.delete(f"/api/sessions/{session['id']}", headers=headers)

    assert deleted.status_code == 409


def test_404_for_a_non_owner():
    client, ctx, _, _ = build_client()
    session = _create_session(client, _auth(ctx, "user_owner"))

    deleted = client.delete(
        f"/api/sessions/{session['id']}", headers=_auth(ctx, "user_intruder")
    )

    assert deleted.status_code == 404
    # The owner's Session is untouched by the failed intruder delete.
    assert (
        client.get(
            f"/api/sessions/{session['id']}", headers=_auth(ctx, "user_owner")
        ).status_code
        == 200
    )


def test_404_for_an_unknown_session():
    client, ctx, _, _ = build_client()
    assert (
        client.delete("/api/sessions/424242", headers=_auth(ctx, "user_a")).status_code
        == 404
    )


def test_detail_read_carries_logged_count():
    client, ctx, _, logged = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)

    # Born unperformed → count 0
    fresh = client.get(f"/api/sessions/{session['id']}", headers=headers).json()
    assert fresh["data"]["logged_count"] == 0

    # Two performances → count 2
    _log_against(logged, "user_a", session["id"])
    _log_against(logged, "user_a", session["id"])
    reread = client.get(f"/api/sessions/{session['id']}", headers=headers).json()
    assert reread["data"]["logged_count"] == 2


def test_list_rows_carry_logged_count():
    client, ctx, _, logged = build_client()
    headers = _auth(ctx, "user_a")
    performed = _create_session(client, headers)
    _create_session(client, headers)  # never performed
    _log_against(logged, "user_a", performed["id"])

    rows = client.get("/api/sessions", headers=headers).json()["data"]
    by_id = {row["id"]: row["logged_count"] for row in rows}
    assert by_id[performed["id"]] == 1
    assert sum(count == 0 for count in by_id.values()) == 1
