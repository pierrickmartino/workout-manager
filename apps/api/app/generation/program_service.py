"""The multi-week Program generation work: AI output → store → Adoption.

The cache decision (hit / miss / bypass) is made by the Generation Orchestrator
(Slice 7, ADR-0005); this module owns the two reusable pieces around it:

- ``cache_request_for`` combines generation params with the user's Profile into
  the coarse cache-key input (Slice 6, ADR-0003);
- ``run_generation`` is the body the async worker runs on a miss/bypass — generate
  fresh, store the artifact *only* when a shared key is given, then Adopt a
  user-owned copy.

A ``GenerationError`` from the generator propagates before anything is persisted.
"""

from __future__ import annotations

from typing import Protocol

from app.adoption.service import adopt
from app.generation.cache import CacheRequest, GenerationCache
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


def run_generation(
    request: ProgramGenerationRequest,
    clerk_user_id: str,
    cache_key: str | None,
    *,
    cache: GenerationCache,
    generator: ProgramGenerator,
    exercises: ExerciseRepository,
    programs: ProgramRepository,
) -> ProgramView:
    """Generate fresh, store (only when keyed), then Adopt — the worker's body.

    This is the work the async job performs once the cache decision has already
    been made by the orchestrator: ``cache_key`` is the miss's key when the result
    may be shared, or ``None`` for a bypass that must never be stored under a
    shared key. Raises ``GenerationError`` (from the generator) on malformed or
    under-enumerated output, in which case nothing is written.
    """

    generated = generator.generate(request)
    if cache_key is not None:
        cache.store(cache_key, generated)

    return adopt(
        generated,
        clerk_user_id,
        request,
        exercises=exercises,
        programs=programs,
    )


__all__ = ["run_generation", "cache_request_for"]
