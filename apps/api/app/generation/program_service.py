"""The multi-week Program path: cache → AI output → Adoption → user-owned Program.

``generate_program`` orchestrates the full flow with the Generation Cache in
front of generation (Slice 6, ADR-0003):

- on a cache **hit**, the shared Generated Program is Adopted immediately — no
  new AI call;
- on a non-bypass **miss**, generate fresh, store the artifact under the miss's
  key, then Adopt;
- on a **bypass** (any Sensitive Constraint), always generate fresh and never
  store under a shared key — caution is genuinely applied.

Generation remains synchronous here; the async job path lands in a later slice.
A ``GenerationError`` from the generator propagates before anything is persisted.
"""

from __future__ import annotations

from typing import Protocol

from app.adoption.service import adopt
from app.generation.cache import (
    CacheRequest,
    CacheStatus,
    GenerationCache,
)
from app.generation.program_generator import (
    ProgramGenerationRequest,
    ProgramGenerator,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.program_repository import ProgramRepository, ProgramView


class _ProfileForCache(Protocol):
    """The Profile fields the coarse cache key (and bypass) are derived from."""

    fitness_levels: dict[str, int]
    preferences: list[str]
    sensitive_constraints: list[str]
    age: int | None
    weight_kg: float | None
    height_cm: float | None


def cache_request_for(
    params: ProgramGenerationRequest, profile: _ProfileForCache
) -> CacheRequest:
    """Combine generation ``params`` with the user's ``profile`` into a cache key
    input: the per-training-type Fitness Level and the constraint fields come
    from the profile; the continuous values are carried but excluded from the key.
    """

    return CacheRequest(
        training_type=params.training_type,
        objective=params.objective,
        fitness_level=profile.fitness_levels.get(params.training_type, 0),
        sessions_per_week=params.sessions_per_week,
        weeks=params.weeks,
        duration_minutes=params.duration_minutes,
        equipment=list(params.equipment),
        preferences=list(profile.preferences),
        sensitive_constraints=list(profile.sensitive_constraints),
        age=profile.age,
        weight_kg=profile.weight_kg,
        height_cm=profile.height_cm,
    )


def generate_program(
    request: ProgramGenerationRequest,
    clerk_user_id: str,
    *,
    cache: GenerationCache,
    cache_request: CacheRequest,
    generator: ProgramGenerator,
    exercises: ExerciseRepository,
    programs: ProgramRepository,
) -> ProgramView:
    """Generate-or-reuse a Program and Adopt it as a user-owned copy.

    Consults the Generation Cache first: a hit is Adopted without an AI call; a
    non-bypass miss generates, stores, then Adopts; a bypass generates fresh and
    stores nothing. Raises ``GenerationError`` (from the generator) on malformed
    or under-enumerated output, in which case nothing is written.
    """

    result = cache.lookup(cache_request)
    if result.status is CacheStatus.HIT:
        return adopt(
            result.artifact,
            clerk_user_id,
            request,
            exercises=exercises,
            programs=programs,
        )

    generated = generator.generate(request)
    if result.status is CacheStatus.MISS:
        cache.store(result.key, generated)

    return adopt(
        generated,
        clerk_user_id,
        request,
        exercises=exercises,
        programs=programs,
    )


__all__ = ["generate_program", "cache_request_for"]
