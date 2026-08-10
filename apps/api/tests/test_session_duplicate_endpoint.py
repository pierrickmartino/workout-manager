"""The Duplicate endpoint end to end: real JWKS verification, the repositories,
and the response envelope wired through FastAPI.

``POST /api/sessions/{id}/duplicate`` deep-copies the owner's Session into a new
standalone Session (ADR-0043) — a reusable plan with the source's prescriptions,
Supersets, Provenance, and lineage, but no records and no Protocol position.
``404`` for anyone who does not own the source. Repositories and the generator
are injected via dependency overrides so the tests run offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5", rest_seconds=120
                ),
                GeneratedExercisePrescription(
                    exercise_name="Overhead Press", sets=3, reps="8-12"
                ),
            ]
        )


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def test_duplicate_requires_authentication():
    client, _ = build_client()
    response = client.post("/api/sessions/1/duplicate")
    assert response.status_code == 401


def test_duplicate_creates_a_new_standalone_copy():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_dup")
    source = _create_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=headers
    )

    # Assert — a distinct Session with the same prescriptions, standalone
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    copy = body["data"]
    assert copy["id"] != source["id"]
    assert copy["clerk_user_id"] == "user_dup"
    assert [p["exercise_name"] for p in copy["prescriptions"]] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert copy["has_been_regenerated"] is False


def test_duplicate_404s_for_another_users_session():
    # Arrange — a non-owner can never copy another user's plan
    client, ctx = build_client()
    source = _create_session(client, _auth(ctx, "user_owner"))

    # Act
    response = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=_auth(ctx, "user_intruder")
    )

    # Assert
    assert response.status_code == 404


def test_duplicate_404s_for_an_unknown_session():
    client, ctx = build_client()
    response = client.post(
        "/api/sessions/424242/duplicate", headers=_auth(ctx, "user_any")
    )
    assert response.status_code == 404
