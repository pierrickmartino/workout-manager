"""Level folding reaches generation through the coarse cache key (ADR-0004).

These tests pin the integration the issue's headline acceptance criterion asks
for: once a user has logged sustained strong progress in a training type, the
*next* Program generation keys off the advanced Fitness Level — so the cache
lookup targets the right difficulty — while a different type's level is untouched.
No raw logged history is passed into generation; only the folded coarse level is.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.generation.cache import _level_bucket
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.program_service import cache_request_for


@dataclass
class _SetStub:
    perceived_difficulty: int | None


@dataclass
class _SessionStub:
    training_type: str
    logged_sets: list[_SetStub] = field(default_factory=list)


@dataclass
class _ProfileStub:
    """A Profile carrying only what the cache key (and folding) reads."""

    fitness_levels: dict[str, int] = field(default_factory=dict)
    preferences: list[str] = field(default_factory=list)
    sensitive_constraints: list[str] = field(default_factory=list)
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


def _params(training_type: str) -> ProgramGenerationRequest:
    return ProgramGenerationRequest(
        training_type=training_type,
        objective="gain muscle mass",
        sessions_per_week=3,
        weeks=4,
        duration_minutes=60,
        equipment=["barbell"],
    )


def _strong_sessions(training_type: str, count: int) -> list[_SessionStub]:
    return [
        _SessionStub(
            training_type=training_type,
            logged_sets=[_SetStub(perceived_difficulty=5)],
        )
        for _ in range(count)
    ]


def test_generation_keys_off_the_advanced_level_after_sustained_progress():
    # Arrange — baseline strength level 5, plus enough strong strength sessions
    profile = _ProfileStub(fitness_levels={"strength": 5})
    logged = _strong_sessions("strength", 3)

    # Act
    request = cache_request_for(_params("strength"), profile, logged)

    # Assert — the next generation is keyed at the advanced level, not the baseline
    assert request.fitness_level == 6


def test_advanced_level_can_move_the_cache_into_the_next_difficulty_band():
    # Arrange — baseline 7 (intermediate band); strong progress crosses into advanced
    profile = _ProfileStub(fitness_levels={"strength": 7})
    logged = _strong_sessions("strength", 3)

    # Act
    request = cache_request_for(_params("strength"), profile, logged)

    # Assert — level 7 → 8 flips the coarse band, so a different cached plan is hit
    assert _level_bucket(profile.fitness_levels["strength"]) == "intermediate"
    assert _level_bucket(request.fitness_level) == "advanced"


def test_progress_in_one_type_does_not_advance_anothers_generation_level():
    # Arrange — strong strength work, but we are generating a yoga Program
    profile = _ProfileStub(fitness_levels={"strength": 5, "yoga": 2})
    logged = _strong_sessions("strength", 9)

    # Act
    request = cache_request_for(_params("yoga"), profile, logged)

    # Assert — yoga keys off its own untouched level
    assert request.fitness_level == 2


def test_without_logged_progress_generation_uses_the_baseline_level():
    # Arrange
    profile = _ProfileStub(fitness_levels={"strength": 5})

    # Act
    request = cache_request_for(_params("strength"), profile, [])

    # Assert
    assert request.fitness_level == 5
