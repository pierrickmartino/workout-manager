"""Behavior of the session-logging endpoints end to end: real JWKS verification,
the repositories, the logbook service, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

A user generates a Session (Slice 3), logs a performance against it, and reads
their history back. Ownership and validation are enforced at the boundary."""

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
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
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


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _generate_session(client, headers) -> dict:
    return client.post(
        "/api/sessions/generate",
        headers=headers,
        json={
            "training_type": "strength",
            "duration_minutes": 45,
            "equipment": ["barbell"],
        },
    ).json()["data"]


def _log_body(session, **overrides):
    exercise_id = session["prescriptions"][0]["exercise_id"]
    body = {
        "performed_on": "2026-06-20",
        "logged_sets": [
            {
                "exercise_id": exercise_id,
                "reps": 5,
                "load": "70kg",
                "perceived_difficulty": 8,
            }
        ],
    }
    body.update(overrides)
    return body


def test_logging_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post(
        "/api/sessions/1/logs", json={"performed_on": "2026-06-20", "logged_sets": []}
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_user_logs_a_performance_and_reads_it_back_in_history():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_logger")
    session = _generate_session(client, headers)

    # Act — log a performance, then fetch history
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )
    history = client.get("/api/logs", headers=headers)

    # Assert — the logged performance round-trips with its set and perceived difficulty
    assert logged.status_code == 200
    data = logged.json()["data"]
    assert data["session_id"] == session["id"]
    assert data["performed_on"] == "2026-06-20"
    assert data["training_type"] == "strength"
    assert data["logged_sets"][0]["reps"] == 5
    assert data["logged_sets"][0]["load"] == "70kg"
    assert data["logged_sets"][0]["perceived_difficulty"] == 8
    assert data["logged_sets"][0]["exercise_name"] == "Back Squat"

    entries = history.json()["data"]
    assert len(entries) == 1
    assert entries[0]["id"] == data["id"]


def test_same_session_logged_twice_yields_two_history_entries():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_twice")
    session = _generate_session(client, headers)

    # Act — two performances of the same Session
    client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, performed_on="2026-06-20"),
    )
    client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, performed_on="2026-06-27"),
    )
    history = client.get("/api/logs", headers=headers).json()["data"]

    # Assert — recorded separately, newest first
    assert len(history) == 2
    assert [e["performed_on"] for e in history] == ["2026-06-27", "2026-06-20"]


def test_user_cannot_log_another_users_session():
    # Arrange — owner generates a Session
    client, ctx = build_client()
    owner_headers = _auth(ctx, "user_owner")
    session = _generate_session(client, owner_headers)

    # Act — a different user tries to log against it
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=_auth(ctx, "user_intruder"),
        json=_log_body(session),
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_history_is_scoped_to_the_requesting_user():
    # Arrange — owner logs a performance
    client, ctx = build_client()
    owner_headers = _auth(ctx, "user_owner")
    session = _generate_session(client, owner_headers)
    client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=owner_headers,
        json=_log_body(session),
    )

    # Act — a different user requests their (empty) history
    history = client.get("/api/logs", headers=_auth(ctx, "user_other"))

    # Assert
    assert history.status_code == 200
    assert history.json()["data"] == []


def test_logging_an_unknown_exercise_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_badexercise")
    session = _generate_session(client, headers)

    # Act — reference an exercise id that is not in the catalog
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, logged_sets=[{"exercise_id": 9999, "reps": 5}]),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_logging_rejects_an_empty_set_list():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_empty")
    session = _generate_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json={"performed_on": "2026-06-20", "logged_sets": []},
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False
