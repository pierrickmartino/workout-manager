"""The Effective Fitness Level reaches generation through the coarse cache key.

ADR-0004 §2 settled that logged progress reaches a future generation through the level
dimension of the cache key and nowhere else; ADR-0112 settled *how* that level reads the
record. These tests pin the integration end to end: once a user's recent Logged Sessions
of a training type say something, the *next* generation keys off the **Effective Fitness
Level** — so the cache lookup targets the right difficulty — while a different type's
level is untouched and the raw logged history never reaches generation at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.completion import CompletionOutcome
from app.domain.effort import HIGH_EFFORT_MIN
from app.domain.fitness_profile import (
    DEFAULT_EFFECTIVE_LEVEL_WINDOW,
    DEFAULT_STRONG_SESSIONS_PER_LEVEL,
)
from app.domain.progression import LOW_EFFORT_MAX
from app.generation.cache import _level_bucket
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.protocol_service import cache_request_for

#: The most notches a full window of nothing but comfortable Sessions can earn.
MAX_NOTCHES = DEFAULT_EFFECTIVE_LEVEL_WINDOW // DEFAULT_STRONG_SESSIONS_PER_LEVEL


@dataclass
class _SetStub:
    perceived_difficulty: int | None = None


@dataclass
class _SessionStub:
    training_type: str
    completion_outcome: str | None = None
    logged_sets: list[_SetStub] = field(default_factory=list)


@dataclass
class _ProfileStub:
    """A Profile carrying only what the cache key (and the level read) looks at.

    ``fitness_levels`` are the **Declared** levels — the stored 1–10 the user states."""

    fitness_levels: dict[str, int] = field(default_factory=dict)
    preferences: list[str] = field(default_factory=list)
    sensitive_constraints: list[str] = field(default_factory=list)
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


def _params(training_type: str) -> ProtocolGenerationRequest:
    return ProtocolGenerationRequest(
        training_type=training_type,
        objective="gain muscle mass",
        sessions_per_week=3,
        weeks=4,
        duration_minutes=60,
        equipment=["barbell"],
    )


def _comfortable_sessions(training_type: str, count: int) -> list[_SessionStub]:
    """Sessions declared Completed with every rated set at low Effort."""

    return [
        _SessionStub(
            training_type=training_type,
            completion_outcome=CompletionOutcome.COMPLETED.value,
            logged_sets=[_SetStub(perceived_difficulty=LOW_EFFORT_MAX)],
        )
        for _ in range(count)
    ]


def _strained_sessions(training_type: str, count: int) -> list[_SessionStub]:
    """Sessions declared Incomplete — prescribed work left un-attempted."""

    return [
        _SessionStub(
            training_type=training_type,
            completion_outcome=CompletionOutcome.INCOMPLETE.value,
            logged_sets=[_SetStub(perceived_difficulty=HIGH_EFFORT_MIN)],
        )
        for _ in range(count)
    ]


def test_generation_keys_off_the_effective_level_after_comfortable_progress():
    # Arrange — Declared strength level 5, plus a quorum of comfortable strength Sessions
    profile = _ProfileStub(fitness_levels={"strength": 5})
    logged = _comfortable_sessions("strength", DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act
    request = cache_request_for(_params("strength"), profile, logged)

    # Assert — the next generation is keyed at the Effective level, not the Declared one
    assert request.fitness_level == 6


def test_the_effective_level_can_move_the_cache_into_the_next_difficulty_band():
    # Arrange — Declared 7 (intermediate band); comfortable progress crosses into advanced
    profile = _ProfileStub(fitness_levels={"strength": 7})
    logged = _comfortable_sessions("strength", DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act
    request = cache_request_for(_params("strength"), profile, logged)

    # Assert — level 7 → 8 flips the coarse band, so a different cached plan is hit
    assert _level_bucket(profile.fitness_levels["strength"]) == "intermediate"
    assert _level_bucket(request.fitness_level) == "advanced"


def test_a_recently_strained_user_is_generated_at_their_declared_level():
    # Arrange — a long comfortable past, but the recent window is all Incomplete work
    profile = _ProfileStub(fitness_levels={"strength": 5})
    logged = _strained_sessions("strength", DEFAULT_EFFECTIVE_LEVEL_WINDOW)
    logged += _comfortable_sessions("strength", 10 * DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    request = cache_request_for(_params("strength"), profile, logged)

    # Assert — credit is withdrawable, and the Declared level is the floor it stops at
    assert request.fitness_level == 5


def test_progress_in_one_type_does_not_move_anothers_generation_level():
    # Arrange — comfortable strength work, but we are generating a yoga Protocol
    profile = _ProfileStub(fitness_levels={"strength": 5, "yoga": 2})
    logged = _comfortable_sessions("strength", DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    request = cache_request_for(_params("yoga"), profile, logged)

    # Assert — yoga keys off its own untouched Declared level
    assert request.fitness_level == 2


def test_without_logged_history_generation_uses_the_declared_level():
    # Arrange — a user on their first day
    profile = _ProfileStub(fitness_levels={"strength": 5})

    # Act
    request = cache_request_for(_params("strength"), profile, [])

    # Assert
    assert request.fitness_level == 5


def test_the_raw_logged_history_never_reaches_generation():
    # Arrange — one user read from a full comfortable window, and another whose Declared
    # level already sits where that window lands them, with nothing logged at all
    from_record = _ProfileStub(fitness_levels={"strength": 5})
    history = _comfortable_sessions("strength", DEFAULT_EFFECTIVE_LEVEL_WINDOW)
    already_there = _ProfileStub(fitness_levels={"strength": 5 + MAX_NOTCHES})

    # Act
    keyed_from_history = cache_request_for(_params("strength"), from_record, history)
    keyed_from_level_alone = cache_request_for(_params("strength"), already_there, [])

    # Assert — the two requests are indistinguishable, so the only channel the record has
    # into a generation is the coarse level; no set, effort or outcome rides along
    assert keyed_from_history == keyed_from_level_alone
    assert keyed_from_history.fitness_level == 9
