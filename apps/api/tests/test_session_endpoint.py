"""Behavior of the Session generation endpoints end to end: real JWKS
verification, the repositories, the generation service, and the response envelope
wired through FastAPI. The AI generator and repositories are injected via
dependency overrides so the tests run offline and deterministically."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationError, GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        if self._error is not None:
            raise self._error
        return self._result


def _default_generation() -> GeneratedSession:
    return GeneratedSession(
        prescriptions=[
            GeneratedExercisePrescription(
                exercise_name="Back Squat",
                exercise_description="Compound lower-body lift.",
                targeted_muscles=["quads"],
                required_equipment=["barbell"],
                sets=5,
                reps="5",
                rest_seconds=120,
                tempo="3-1-1",
                recommended_load="70% 1RM",
            )
        ]
    )


def build_client(generator=None, ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    generator = generator or FakeGenerator(result=_default_generation())
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_session_generator] = lambda: generator
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _generate_body(**overrides):
    body = {
        "training_type": "strength",
        "duration_minutes": 45,
        "equipment": ["barbell"],
    }
    body.update(overrides)
    return body


def test_generate_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post("/api/sessions/generate", json=_generate_body())

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_generate_returns_a_session_with_its_prescriptions():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_gen"),
        json=_generate_body(),
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["training_type"] == "strength"
    assert data["duration_minutes"] == 45
    assert len(data["prescriptions"]) == 1
    prescription = data["prescriptions"][0]
    assert prescription["exercise_name"] == "Back Squat"
    assert prescription["sets"] == 5
    assert prescription["reps"] == "5"
    assert prescription["rest_seconds"] == 120
    assert prescription["tempo"] == "3-1-1"
    assert prescription["recommended_load"] == "70% 1RM"
    assert prescription["provenance"] == "ai_generated"


def test_generated_session_can_be_fetched_back_by_its_owner():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_fetch")
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]

    # Act
    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers)

    # Assert
    assert fetched.status_code == 200
    assert fetched.json()["data"]["id"] == created["id"]
    assert len(fetched.json()["data"]["prescriptions"]) == 1


def test_another_user_cannot_fetch_someone_elses_session():
    # Arrange
    client, ctx = build_client()
    created = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_owner"),
        json=_generate_body(),
    ).json()["data"]

    # Act — a different user requests the same session id
    response = client.get(
        f"/api/sessions/{created['id']}", headers=_auth(ctx, "user_intruder")
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_malformed_generation_returns_502_and_persists_nothing():
    # Arrange — the generator fails the boundary validation
    client, ctx = build_client(
        generator=FakeGenerator(error=GenerationError("unparseable"))
    )
    headers = _auth(ctx, "user_bad")

    # Act
    response = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    )

    # Assert — surfaced as an upstream error, not a silent persist
    assert response.status_code == 502
    assert response.json()["success"] is False
    # Nothing was stored: the first session id is absent
    assert client.get("/api/sessions/1", headers=headers).status_code == 404


def test_generate_rejects_a_non_positive_duration():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_badreq"),
        json=_generate_body(duration_minutes=0),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False
