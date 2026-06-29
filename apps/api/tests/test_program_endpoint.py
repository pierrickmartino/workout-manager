"""Behavior of the Program endpoints end to end: JWKS verification, the
generate-then-adopt path, the repositories, the self-paced progress view, and the
response envelope wired through FastAPI. The AI generator and repositories are
injected via dependency overrides so the tests run offline and deterministically."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationError
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_program_generator,
    get_program_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.program_repository import InMemoryProgramRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeProgramGenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error

    def generate(self, request: ProgramGenerationRequest) -> GeneratedProgram:
        if self._error is not None:
            raise self._error
        return self._result


def _default_program() -> GeneratedProgram:
    return GeneratedProgram(
        sessions=[
            GeneratedProgramSession(
                week=week,
                day=1,
                title=f"Week {week} Push",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        targeted_muscles=["quads"],
                        required_equipment=["barbell"],
                        sets=5,
                        reps="5",
                        recommended_load=f"{55 + week * 5}% 1RM",
                    )
                ],
            )
            for week in (1, 2)
        ]
    )


def build_client(generator=None, ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    generator = generator or FakeProgramGenerator(result=_default_program())
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_program_repository] = lambda: programs
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_program_generator] = lambda: generator
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _body(**overrides):
    body = {
        "training_type": "strength",
        "objective": "gain muscle mass",
        "sessions_per_week": 1,
        "duration_minutes": 45,
        "weeks": 2,
        "equipment": ["barbell"],
    }
    body.update(overrides)
    return body


def test_generate_requires_authentication():
    client, _ = build_client()
    response = client.post("/api/programs/generate", json=_body())
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_generate_returns_a_fully_enumerated_user_owned_program():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_gen"), json=_body()
    )

    # Assert — every week enumerated up front, distinct per-week loads
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["objective"] == "gain muscle mass"
    assert data["weeks"] == 2
    assert [s["week"] for s in data["sessions"]] == [1, 2]
    loads = [s["prescriptions"][0]["recommended_load"] for s in data["sessions"]]
    assert loads == ["60% 1RM", "65% 1RM"]


def test_fetched_program_surfaces_the_next_un_performed_session():
    # Arrange — a fresh program: Week 1 is next
    client, ctx = build_client()
    headers = _auth(ctx, "user_next")
    created = client.post(
        "/api/programs/generate", headers=headers, json=_body()
    ).json()["data"]

    # Act
    fetched = client.get(f"/api/programs/{created['id']}", headers=headers)

    # Assert
    assert fetched.status_code == 200
    data = fetched.json()["data"]
    assert data["completed_count"] == 0
    assert data["next_session"]["week"] == 1


def test_another_user_cannot_fetch_someone_elses_program():
    # Arrange
    client, ctx = build_client()
    created = client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_owner"), json=_body()
    ).json()["data"]

    # Act
    response = client.get(
        f"/api/programs/{created['id']}", headers=_auth(ctx, "user_intruder")
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_malformed_generation_returns_502():
    # Arrange — an under-enumerated program fails boundary validation
    client, ctx = build_client(
        generator=FakeProgramGenerator(error=GenerationError("not enumerated"))
    )

    # Act
    response = client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_bad"), json=_body()
    )

    # Assert
    assert response.status_code == 502
    assert response.json()["success"] is False


def test_generate_rejects_zero_weeks():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/programs/generate",
        headers=_auth(ctx, "user_badreq"),
        json=_body(weeks=0),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False
