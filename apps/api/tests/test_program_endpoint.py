"""Behavior of the Program endpoints end to end: JWKS verification, the
generate-then-adopt path, the repositories, the self-paced progress view, and the
response envelope wired through FastAPI. The AI generator and repositories are
injected via dependency overrides so the tests run offline and deterministically."""

from __future__ import annotations

from datetime import date

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
from app.generation.cache import GenerationCache, InMemoryCacheStore
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_cache,
    get_logged_session_repository,
    get_profile_repository,
    get_program_generator,
    get_program_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.program_repository import InMemoryProgramRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeProgramGenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = 0

    def generate(self, request: ProgramGenerationRequest) -> GeneratedProgram:
        self.calls += 1
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


def build_client(
    generator=None,
    ctx=None,
    profiles=None,
    cache=None,
    exercises=None,
    programs=None,
    logged=None,
):
    ctx = ctx or make_signing_context()
    exercises = exercises or InMemoryExerciseRepository()
    programs = programs or InMemoryProgramRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = logged or InMemoryLoggedSessionRepository(sessions, exercises)
    generator = generator or FakeProgramGenerator(result=_default_program())
    profiles = profiles or InMemoryProfileRepository()
    cache = cache or GenerationCache(InMemoryCacheStore())
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_program_repository] = lambda: programs
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_program_generator] = lambda: generator
    app.dependency_overrides[get_generation_cache] = lambda: cache
    app.dependency_overrides[get_profile_repository] = lambda: profiles
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


def _kg_program() -> GeneratedProgram:
    """A two-week program whose Back Squat carries an adjustable kg load."""

    return GeneratedProgram(
        sessions=[
            GeneratedProgramSession(
                week=week,
                day=1,
                title=f"Week {week}",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        sets=3,
                        reps="5",
                        recommended_load="60 kg",
                    )
                ],
            )
            for week in (1, 2)
        ]
    )


def test_fetched_program_shows_progressed_load_for_upcoming_sessions():
    # Arrange — generate a kg-load program, then perform Week 1 strongly
    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    client, ctx = build_client(
        generator=FakeProgramGenerator(result=_kg_program()),
        exercises=exercises,
        programs=programs,
        logged=logged,
    )
    headers = _auth(ctx, "user_progress")
    created = client.post(
        "/api/programs/generate", headers=headers, json=_body()
    ).json()["data"]
    week_one = created["sessions"][0]
    logged.create(
        "user_progress",
        LoggedSessionDraft(
            session_id=week_one["session_id"],
            performed_on=date(2026, 1, 1),
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=week_one["prescriptions"][0]["exercise_id"],
                    reps=5,
                    load="60 kg",
                    perceived_difficulty=6,
                )
                for _ in range(3)
            ],
        ),
    )

    # Act
    fetched = client.get(f"/api/programs/{created['id']}", headers=headers)

    # Assert — the upcoming Week-2 Session shows the raised recommendation
    data = fetched.json()["data"]
    assert data["next_session"]["week"] == 2
    assert data["next_session"]["prescriptions"][0]["recommended_load"] == "62.5 kg"


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


def test_second_equivalent_request_is_served_from_cache_over_http():
    # Arrange — a counting generator behind two users with equivalent coarse
    # requests; the cache and profile repo are shared across the app
    generator = FakeProgramGenerator(result=_default_program())
    client, ctx = build_client(generator=generator)

    # Act — two equivalent generations from different users
    first = client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_one"), json=_body()
    )
    second = client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_two"), json=_body()
    )

    # Assert — the second was served from cache: only one AI call, two Programs
    assert first.status_code == 200
    assert second.status_code == 200
    assert generator.calls == 1
    assert first.json()["data"]["id"] != second.json()["data"]["id"]


def test_sensitive_user_always_regenerates_over_http():
    # Arrange — a user flagged with a Sensitive Constraint
    generator = FakeProgramGenerator(result=_default_program())
    profiles = InMemoryProfileRepository()
    profiles.update(
        "user_sensitive", ProfileUpdate(sensitive_constraints=["injury"])
    )
    client, ctx = build_client(generator=generator, profiles=profiles)

    # Act — the sensitive user requests the same parameters twice
    client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_sensitive"), json=_body()
    )
    client.post(
        "/api/programs/generate", headers=_auth(ctx, "user_sensitive"), json=_body()
    )

    # Assert — the cache is bypassed every time: a fresh generation each request
    assert generator.calls == 2


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
