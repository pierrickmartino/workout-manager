"""Behavior of the Program endpoints end to end under async generation (Slice 7).

A generate request no longer blocks on the AI: a cache **miss** returns a job
handle (``202``) and a worker completes the generation independently, so a dropped
mobile connection never loses the result; the PWA polls ``/programs/jobs/{id}``
until the adopted Program id appears. A cache **hit** still returns instantly
(``200``) with the Program id and no job. The AI generator, repositories, cache
and queue are injected via dependency overrides so the tests run offline; the
in-memory queue's ``work()`` stands in for the out-of-process RQ worker.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationError
from app.generation.job_queue import InMemoryJobQueue
from app.generation.orchestrator import GenerationOrchestrator
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.program_service import run_generation
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)
from app.generation.cache import GenerationCache, InMemoryCacheStore
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_orchestrator,
    get_logged_session_repository,
    get_profile_repository,
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


class _Harness:
    """The wired app plus handles the tests drive: the queue (worker) and the
    counting generator."""

    def __init__(self, client, ctx, queue, generator, logged):
        self.client = client
        self.ctx = ctx
        self.queue = queue
        self.generator = generator
        self.logged = logged

    def auth(self, sub):
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def submit(self, sub, **overrides):
        return self.client.post(
            "/api/programs/generate", headers=self.auth(sub), json=_body(**overrides)
        )

    def poll(self, sub, job_id):
        return self.client.get(
            f"/api/programs/jobs/{job_id}", headers=self.auth(sub)
        )

    def generate_program_id(self, sub, **overrides) -> int:
        """Run a full generate, following the async path to the adopted id."""

        data = self.submit(sub, **overrides).json()["data"]
        if data["program_id"] is not None:  # cache hit — instant
            return data["program_id"]
        self.queue.work()  # the out-of-process worker runs
        job = self.poll(sub, data["job_id"]).json()["data"]
        assert job["status"] == "complete"
        return job["program_id"]

    def fetch_program(self, sub, program_id):
        return self.client.get(
            f"/api/programs/{program_id}", headers=self.auth(sub)
        )


def build_harness(generator=None, ctx=None, profiles=None, cache=None) -> _Harness:
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    generator = generator or FakeProgramGenerator(result=_default_program())
    profiles = profiles or InMemoryProfileRepository()
    cache = cache or GenerationCache(InMemoryCacheStore())

    def runner(request, clerk_user_id, cache_key):
        view = run_generation(
            request,
            clerk_user_id,
            cache_key,
            cache=cache,
            generator=generator,
            exercises=exercises,
            programs=programs,
        )
        return view.id

    queue = InMemoryJobQueue(runner)
    orchestrator = GenerationOrchestrator(
        cache=cache, queue=queue, exercises=exercises, programs=programs
    )

    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_program_repository] = lambda: programs
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_generation_orchestrator] = lambda: orchestrator
    return _Harness(TestClient(app), ctx, queue, generator, logged)


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
    h = build_harness()
    response = h.client.post("/api/programs/generate", json=_body())
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_generate_rejects_zero_weeks():
    h = build_harness()
    response = h.submit("user_badreq", weeks=0)
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_cache_miss_enqueues_a_job_that_completes_to_a_program():
    # Arrange
    h = build_harness()

    # Act — submit returns a handle immediately, without generating inline
    submitted = h.submit("user_gen")

    # Assert — accepted (202), a pending job, no Program yet, no AI call yet
    assert submitted.status_code == 202
    data = submitted.json()["data"]
    assert data["status"] == "pending"
    assert data["job_id"]
    assert data["program_id"] is None
    assert h.generator.calls == 0

    # Act — the worker runs independently of the original request
    h.queue.work()
    job = h.poll("user_gen", data["job_id"]).json()["data"]

    # Assert — the result is retrievable by the handle alone, and the adopted
    # Program is fully enumerated week to week
    assert job["status"] == "complete"
    program = h.fetch_program("user_gen", job["program_id"]).json()["data"]
    assert program["weeks"] == 2
    assert [s["week"] for s in program["sessions"]] == [1, 2]
    loads = [s["prescriptions"][0]["recommended_load"] for s in program["sessions"]]
    assert loads == ["60% 1RM", "65% 1RM"]


def test_cache_hit_returns_a_program_instantly_with_no_job():
    # Arrange — prime the cache with one full generation
    h = build_harness()
    first_id = h.generate_program_id("user_one")

    # Act — an equivalent request from a second user
    response = h.submit("user_two")

    # Assert — served from cache: 200, the Program id inline, no job, one AI call
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "complete"
    assert data["job_id"] is None
    assert data["program_id"] is not None
    assert data["program_id"] != first_id
    assert h.generator.calls == 1


def test_failed_generation_surfaces_through_the_job_not_the_request():
    # Arrange — an under-enumerated generation fails boundary validation
    h = build_harness(
        generator=FakeProgramGenerator(error=GenerationError("not enumerated"))
    )

    # Act — the request is still accepted; the failure lands on the job
    submitted = h.submit("user_bad")
    assert submitted.status_code == 202
    job_id = submitted.json()["data"]["job_id"]
    h.queue.work()
    job = h.poll("user_bad", job_id).json()["data"]

    # Assert — polling reports a failed job with a user-safe message
    assert job["status"] == "failed"
    assert job["program_id"] is None
    assert job["error"]


def test_unknown_job_returns_404():
    h = build_harness()
    response = h.poll("user_x", "job-does-not-exist")
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_sensitive_user_always_regenerates():
    # Arrange — a user flagged with a Sensitive Constraint
    profiles = InMemoryProfileRepository()
    profiles.update("user_sensitive", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(profiles=profiles)

    # Act — the sensitive user requests the same parameters twice, each to done
    h.generate_program_id("user_sensitive")
    h.generate_program_id("user_sensitive")

    # Assert — the cache is bypassed every time: a fresh generation each request
    assert h.generator.calls == 2


def test_fetched_program_surfaces_the_next_un_performed_session():
    # Arrange — a fresh program: Week 1 is next
    h = build_harness()
    program_id = h.generate_program_id("user_next")

    # Act
    fetched = h.fetch_program("user_next", program_id)

    # Assert
    assert fetched.status_code == 200
    data = fetched.json()["data"]
    assert data["completed_count"] == 0
    assert data["next_session"]["week"] == 1


def test_another_user_cannot_fetch_someone_elses_program():
    # Arrange
    h = build_harness()
    program_id = h.generate_program_id("user_owner")

    # Act
    response = h.fetch_program("user_intruder", program_id)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


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
    h = build_harness(generator=FakeProgramGenerator(result=_kg_program()))
    program_id = h.generate_program_id("user_progress")
    created = h.fetch_program("user_progress", program_id).json()["data"]
    week_one = created["next_session"]
    h.logged.create(
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
    fetched = h.fetch_program("user_progress", program_id)

    # Assert — the upcoming Week-2 Session shows the raised recommendation
    data = fetched.json()["data"]
    assert data["next_session"]["week"] == 2
    assert data["next_session"]["prescriptions"][0]["recommended_load"] == "62.5 kg"
