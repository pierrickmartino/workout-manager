"""The Generation Orchestrator: cache → queue (Slice 7, ADR-0005).

``submit`` is the single async front door. It consults the Generation Cache and
branches:

- **hit** → Adopt immediately and return the user-owned Program, with no job;
- **miss** → enqueue a job carrying the miss's cache key (the worker stores), and
  return a handle without any synchronous AI call;
- **bypass** (a Sensitive Constraint) → enqueue a job with *no* cache key, so the
  worker generates fresh and never stores under a shared key.

The worker side (``run_generation``) is exercised here through the in-memory
queue's ``work()`` so the store/adopt side effects are asserted as behavior, not
mocked internals.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.generation.cache import GenerationCache, InMemoryCacheStore
from app.generation.job_queue import InMemoryJobQueue, JobStatus
from app.generation.orchestrator import GenerationOrchestrator
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.program_service import cache_request_for, run_generation
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.program_repository import InMemoryProgramRepository


PARAMS = ProgramGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=1,
    equipment=["barbell"],
)


@dataclass
class _FakeProfile:
    fitness_levels: dict[str, int] = field(default_factory=dict)
    preferences: list[str] = field(default_factory=list)
    sensitive_constraints: list[str] = field(default_factory=list)
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


class _CountingGenerator:
    def __init__(self) -> None:
        self.calls = 0

    def generate(self, request: ProgramGenerationRequest) -> GeneratedProgram:
        self.calls += 1
        return GeneratedProgram(
            sessions=[
                GeneratedProgramSession(
                    week=1,
                    day=1,
                    prescriptions=[
                        GeneratedExercisePrescription(
                            exercise_name="Back Squat", sets=5, reps="5"
                        )
                    ],
                )
            ]
        )


def _build():
    """Compose an orchestrator whose queue runs ``run_generation`` on ``work()``."""

    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    cache = GenerationCache(InMemoryCacheStore())
    generator = _CountingGenerator()

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
    return orchestrator, queue, generator, programs


def test_cache_miss_enqueues_a_job_and_returns_a_handle_without_generating():
    # Arrange
    orchestrator, queue, generator, _ = _build()
    profile = _FakeProfile(fitness_levels={"strength": 5})

    # Act — submit a fresh (miss) request
    outcome = orchestrator.submit(
        PARAMS, "user_a", cache_request_for(PARAMS, profile)
    )

    # Assert — a job handle came back, no Program inline, and NO synchronous AI
    assert outcome.job_id is not None
    assert outcome.program is None
    assert generator.calls == 0
    assert queue.get_state(outcome.job_id).status is JobStatus.PENDING


def test_cache_hit_adopts_inline_and_enqueues_no_job():
    # Arrange — prime the cache by running a first miss to completion
    orchestrator, queue, generator, _ = _build()
    profile = _FakeProfile(fitness_levels={"strength": 5})
    first = orchestrator.submit(PARAMS, "user_a", cache_request_for(PARAMS, profile))
    queue.work()  # the worker generates, stores, and adopts

    # Act — an equivalent request from another user now hits the cache
    outcome = orchestrator.submit(PARAMS, "user_b", cache_request_for(PARAMS, profile))

    # Assert — Adopted inline (a Program, no job) with NO second AI call
    assert outcome.program is not None
    assert outcome.program.clerk_user_id == "user_b"
    assert outcome.job_id is None
    assert generator.calls == 1
    assert queue.get_state(first.job_id).status is JobStatus.COMPLETE


def test_worked_miss_stores_the_artifact_and_adopts_a_user_owned_program():
    # Arrange
    orchestrator, queue, generator, programs = _build()
    profile = _FakeProfile(fitness_levels={"strength": 5})

    # Act — submit, then let the worker run
    outcome = orchestrator.submit(PARAMS, "user_a", cache_request_for(PARAMS, profile))
    queue.work()

    # Assert — the job completed to an adopted, retrievable Program
    state = queue.get_state(outcome.job_id)
    assert state.status is JobStatus.COMPLETE
    assert programs.get(state.program_id, "user_a") is not None


def test_sensitive_bypass_never_stores_so_a_later_equivalent_request_misses():
    # Arrange — a sensitive user shares every coarse parameter with a later
    # ordinary user
    orchestrator, queue, generator, _ = _build()
    sensitive = _FakeProfile(
        fitness_levels={"strength": 5}, sensitive_constraints=["injury"]
    )
    ordinary = _FakeProfile(fitness_levels={"strength": 5})

    # Act — the sensitive request runs to completion, then the ordinary one
    orchestrator.submit(PARAMS, "user_sensitive", cache_request_for(PARAMS, sensitive))
    queue.work()
    outcome = orchestrator.submit(
        PARAMS, "user_ordinary", cache_request_for(PARAMS, ordinary)
    )
    queue.work()

    # Assert — the bypass stored nothing, so the ordinary user MISSED and
    # triggered a second, separate generation (never served the sensitive output)
    assert outcome.job_id is not None
    assert outcome.program is None
    assert generator.calls == 2
