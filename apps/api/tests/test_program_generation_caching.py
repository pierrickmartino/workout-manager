"""Cache-aware Program orchestration (Slice 6, ADR-0003).

``generate_program`` sits in front of the AI: it Adopts a cached artifact on a
hit (no new AI call), generates-then-stores on a non-bypass miss, and — for any
Sensitive Constraint — always generates fresh and never stores under a shared
key. Exercised with a call-counting fake generator and in-memory repos/cache so
the orchestration decisions are asserted through observable behavior.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.generation.cache import (
    CacheStore,
    GenerationCache,
    InMemoryCacheStore,
    derive_key,
)
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.program_service import cache_request_for, generate_program
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
    """A ``ProgramGenerator`` that records how many times it was called."""

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


def _wiring(store: CacheStore | None = None):
    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    cache = GenerationCache(store or InMemoryCacheStore())
    generator = _CountingGenerator()
    return exercises, programs, cache, generator


def _run(clerk_user_id, profile, *, cache, generator, exercises, programs):
    return generate_program(
        PARAMS,
        clerk_user_id,
        cache=cache,
        cache_request=cache_request_for(PARAMS, profile),
        generator=generator,
        exercises=exercises,
        programs=programs,
    )


def test_equivalent_second_request_is_served_from_cache_without_a_new_ai_call():
    # Arrange — two users with equivalent coarse profiles
    exercises, programs, cache, generator = _wiring()
    profile_a = _FakeProfile(fitness_levels={"strength": 5}, weight_kg=70.0)
    profile_b = _FakeProfile(fitness_levels={"strength": 6}, weight_kg=95.0)

    # Act — first request generates and stores; second reuses the cached artifact
    view_a = _run("user_a", profile_a, cache=cache, generator=generator,
                  exercises=exercises, programs=programs)
    view_b = _run("user_b", profile_b, cache=cache, generator=generator,
                  exercises=exercises, programs=programs)

    # Assert — one AI call total, two independent adopted (user-owned) Programs
    assert generator.calls == 1
    assert view_a.clerk_user_id == "user_a"
    assert view_b.clerk_user_id == "user_b"
    assert view_a.id != view_b.id


def test_miss_generates_and_stores_the_artifact():
    # Arrange
    exercises, programs, cache, generator = _wiring()
    profile = _FakeProfile(fitness_levels={"strength": 5})

    # Act
    _run("user_miss", profile, cache=cache, generator=generator,
         exercises=exercises, programs=programs)

    # Assert — a generation happened and the artifact is now cached under its key
    assert generator.calls == 1
    key = derive_key(cache_request_for(PARAMS, profile))
    assert cache.lookup(cache_request_for(PARAMS, profile)).key == key
    stored = cache.lookup(cache_request_for(PARAMS, profile))
    assert stored.artifact is not None


def test_sensitive_profile_always_generates_and_never_stores_a_shared_artifact():
    # Arrange — a sensitive user shares every coarse parameter with a later
    # non-sensitive user
    store = InMemoryCacheStore()
    exercises, programs, cache, generator = _wiring(store)
    sensitive = _FakeProfile(
        fitness_levels={"strength": 5}, sensitive_constraints=["injury"]
    )
    ordinary = _FakeProfile(fitness_levels={"strength": 5})

    # Act — the sensitive user generates; then an ordinary user makes the
    # equivalent request
    view_sensitive = _run("user_sensitive", sensitive, cache=cache,
                          generator=generator, exercises=exercises, programs=programs)
    _run("user_ordinary", ordinary, cache=cache, generator=generator,
         exercises=exercises, programs=programs)

    # Assert — the sensitive run stored nothing, so the ordinary user MISSED and
    # triggered a second, separate generation (never served the sensitive output)
    assert view_sensitive.clerk_user_id == "user_sensitive"
    assert generator.calls == 2
