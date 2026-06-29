"""Behavior of the Generation Feedback and Session Regeneration endpoints end to
end: real JWKS verification, the repositories, the feedback/regeneration services,
and the response envelope wired through FastAPI. The AI generator/regenerator and
repositories are injected via dependency overrides so the tests run offline and
deterministically."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationError, GenerationRequest
from app.generation.regenerator import RegenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_feedback_repository,
    get_session_generator,
    get_session_regenerator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5"
                ),
                GeneratedExercisePrescription(
                    exercise_name="Overhead Press", sets=3, reps="8-12"
                ),
            ]
        )


class FakeRegenerator:
    def __init__(self, *, error=None):
        self._error = error

    def regenerate(self, request: RegenerationRequest) -> GeneratedSession:
        if self._error is not None:
            raise self._error
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Goblet Squat", sets=3, reps="10"
                )
            ]
        )


def build_client(regenerator=None, ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    feedback = InMemoryGenerationFeedbackRepository()
    regenerator = regenerator or FakeRegenerator()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_session_regenerator] = lambda: regenerator
    app.dependency_overrides[get_generation_feedback_repository] = lambda: feedback
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


# --- Generation Feedback ------------------------------------------------------


def test_recording_feedback_requires_authentication():
    client, _ = build_client()
    response = client.post(
        "/api/sessions/1/feedback", json={"verdict": "negative"}
    )
    assert response.status_code == 401


def test_user_records_negative_feedback_with_a_reason():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_fb")
    session = _create_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=headers,
        json={"verdict": "negative", "reason": "too much overhead"},
    )

    # Assert
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["verdict"] == "negative"
    assert data["reason"] == "too much overhead"
    assert data["session_id"] == session["id"]


def test_user_records_positive_feedback_without_a_reason():
    client, ctx = build_client()
    headers = _auth(ctx, "user_pos")
    session = _create_session(client, headers)

    response = client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=headers,
        json={"verdict": "positive"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["verdict"] == "positive"


def test_feedback_on_an_unowned_session_is_not_found():
    # Arrange — one user owns the session, another tries to rate it
    client, ctx = build_client()
    session = _create_session(client, _auth(ctx, "user_owner"))

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=_auth(ctx, "user_intruder"),
        json={"verdict": "negative"},
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_an_unknown_verdict_is_rejected():
    client, ctx = build_client()
    headers = _auth(ctx, "user_badverdict")
    session = _create_session(client, headers)

    response = client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=headers,
        json={"verdict": "meh"},
    )
    assert response.status_code == 422
    assert response.json()["success"] is False


# --- Regeneration -------------------------------------------------------------


def test_regenerate_replaces_non_kept_prescriptions_after_negative_feedback():
    # Arrange — create, rate negatively, then regenerate keeping the first
    client, ctx = build_client()
    headers = _auth(ctx, "user_regen")
    session = _create_session(client, headers)
    client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=headers,
        json={"verdict": "negative", "reason": "knees"},
    )

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/regenerate",
        headers=headers,
        json={"keep": [0]},
    )

    # Assert — kept Back Squat, dropped Overhead Press, added Goblet Squat
    assert response.status_code == 200
    data = response.json()["data"]
    assert [p["exercise_name"] for p in data["prescriptions"]] == [
        "Back Squat",
        "Goblet Squat",
    ]
    assert data["has_been_regenerated"] is True


def test_regenerate_without_negative_feedback_is_a_conflict():
    client, ctx = build_client()
    headers = _auth(ctx, "user_nofb")
    session = _create_session(client, headers)

    response = client.post(
        f"/api/sessions/{session['id']}/regenerate",
        headers=headers,
        json={"keep": [0]},
    )
    assert response.status_code == 409
    assert response.json()["success"] is False


def test_regenerate_is_blocked_after_the_first_time():
    # Arrange — regenerate once
    client, ctx = build_client()
    headers = _auth(ctx, "user_twice")
    session = _create_session(client, headers)
    client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=headers,
        json={"verdict": "negative", "reason": "x"},
    )
    client.post(
        f"/api/sessions/{session['id']}/regenerate",
        headers=headers,
        json={"keep": [0]},
    )

    # Act — a second regeneration is refused
    second = client.post(
        f"/api/sessions/{session['id']}/regenerate",
        headers=headers,
        json={"keep": [0]},
    )

    # Assert
    assert second.status_code == 409


def test_regenerating_an_unowned_session_is_not_found():
    client, ctx = build_client()
    session = _create_session(client, _auth(ctx, "user_owner2"))
    # the owner left negative feedback so only ownership gates the intruder
    client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=_auth(ctx, "user_owner2"),
        json={"verdict": "negative", "reason": "x"},
    )

    response = client.post(
        f"/api/sessions/{session['id']}/regenerate",
        headers=_auth(ctx, "user_intruder2"),
        json={"keep": [0]},
    )
    assert response.status_code == 404


def test_a_malformed_regeneration_returns_502():
    client, ctx = build_client(
        regenerator=FakeRegenerator(error=GenerationError("bad"))
    )
    headers = _auth(ctx, "user_badgen")
    session = _create_session(client, headers)
    client.post(
        f"/api/sessions/{session['id']}/feedback",
        headers=headers,
        json={"verdict": "negative", "reason": "x"},
    )

    response = client.post(
        f"/api/sessions/{session['id']}/regenerate",
        headers=headers,
        json={"keep": [0]},
    )
    assert response.status_code == 502
    assert response.json()["success"] is False
