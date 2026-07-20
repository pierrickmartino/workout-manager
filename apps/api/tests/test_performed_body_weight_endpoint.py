"""Performed Body Weight capture on logged sets, end to end (issue #196, ADR-0026).

Recording a Logged Session snapshots the performer's current Profile weight onto
every Logged Set as its Performed Body Weight, so a later slice can score bodyweight
work against what actually happened. It is raw record data — captured once at the
write boundary, never guessed: with no weight on file the set carries ``None``. Real
JWKS verification, in-memory repositories, and the response envelope wired through
FastAPI so the test stays offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Pull-up",
                    exercise_description="Vertical pull.",
                    targeted_muscles=["lats"],
                    required_equipment=["pull-up bar"],
                    sets=3,
                    reps="8",
                    rest_seconds=120,
                    tempo="2-1-1",
                    recommended_load="bodyweight",
                )
            ]
        )


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx, profiles


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _generate_session(client, headers) -> dict:
    return client.post(
        "/api/sessions/generate",
        headers=headers,
        json={
            "training_type": "strength",
            "duration_minutes": 45,
            "equipment": ["pull-up bar"],
        },
    ).json()["data"]


def _log_body(session) -> dict:
    exercise_id = session["prescriptions"][0]["exercise_id"]
    return {
        "performed_on": "2026-06-20",
        "logged_sets": [
            {
                "exercise_id": exercise_id,
                "reps": 8,
                "load_kind": "bodyweight",
            }
        ],
    }


def test_logging_snapshots_the_performers_profile_weight_onto_each_set():
    # Arrange — the performer has a body weight on file
    client, ctx, profiles = build_client()
    headers = _auth(ctx, "user_bw")
    profiles.update("user_bw", ProfileUpdate(weight_kg=82.5))
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — the set carries the mass performed at, captured at the write boundary
    assert logged.status_code == 200
    assert logged.json()["data"]["logged_sets"][0]["body_weight_kg"] == 82.5


def test_logging_without_a_profile_weight_stores_no_performed_body_weight():
    # Arrange — the performer has no body weight on file (never guessed)
    client, ctx, _ = build_client()
    headers = _auth(ctx, "user_noweight")
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — the set carries no Performed Body Weight, not a fabricated value
    assert logged.status_code == 200
    assert logged.json()["data"]["logged_sets"][0]["body_weight_kg"] is None
