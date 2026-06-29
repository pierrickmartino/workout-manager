"""Behavior of the Profile & Level domain module: the derived ``is_sensitive``
predicate that gates the generation safety bypass (ADR-0003), and ``advance_level``
which folds sustained strong logged progress into the per-training-type Fitness
Level (ADR-0004). The bypass is *derived* from the stored specific constraint
types, never a standalone boolean; the advanced level is likewise *derived* from
the baseline level plus logged history, never persisted in place of the baseline."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.domain.fitness_profile import (
    DEFAULT_STRONG_SESSIONS_PER_LEVEL,
    MAX_FITNESS_LEVEL,
    SensitiveConstraintType,
    advance_level,
    is_sensitive,
)
from app.domain.progression import LOW_EFFORT_MAX


@dataclass
class _ProfileStub:
    """Minimal stand-in carrying only what ``is_sensitive`` reads."""

    sensitive_constraints: list[str] = field(default_factory=list)


def test_profile_with_no_constraints_is_not_sensitive():
    # Arrange
    profile = _ProfileStub(sensitive_constraints=[])

    # Act / Assert
    assert is_sensitive(profile) is False


def test_profile_with_a_sensitive_type_is_sensitive():
    # Arrange
    profile = _ProfileStub(
        sensitive_constraints=[SensitiveConstraintType.INJURY.value]
    )

    # Act / Assert
    assert is_sensitive(profile) is True


@pytest.mark.parametrize("constraint_type", list(SensitiveConstraintType))
def test_every_sensitive_type_triggers_the_bypass(constraint_type):
    # Arrange
    profile = _ProfileStub(sensitive_constraints=[constraint_type.value])

    # Act / Assert
    assert is_sensitive(profile) is True


def test_unrecognized_constraint_string_does_not_make_profile_sensitive():
    # Arrange — a free-text preference accidentally landing in the wrong field
    profile = _ProfileStub(sensitive_constraints=["no running"])

    # Act / Assert
    assert is_sensitive(profile) is False


# --- advance_level: folding logged progress into the per-type Fitness Level ---


@dataclass
class _SetStub:
    """A logged set carrying only the Performance Feedback ``advance_level`` reads."""

    perceived_difficulty: int | None


@dataclass
class _SessionStub:
    """A logged session: its prescribing training type and the sets performed."""

    training_type: str
    logged_sets: list[_SetStub] = field(default_factory=list)


def _strong_session(training_type: str, sets: int = 1) -> _SessionStub:
    """A logged session of ``training_type`` performed comfortably (low effort)."""

    return _SessionStub(
        training_type=training_type,
        logged_sets=[_SetStub(perceived_difficulty=5) for _ in range(sets)],
    )


def test_no_logged_sessions_leaves_levels_unchanged():
    # Arrange
    levels = {"strength": 5, "yoga": 2}

    # Act
    advanced = advance_level(levels, [])

    # Assert
    assert advanced == {"strength": 5, "yoga": 2}


def test_sustained_strong_sessions_advance_that_types_level_one_notch():
    # Arrange — exactly the threshold of strong strength sessions
    levels = {"strength": 5}
    sessions = [
        _strong_session("strength") for _ in range(DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    ]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert
    assert advanced["strength"] == 6


def test_progress_below_the_threshold_does_not_advance():
    # Arrange — one short of the threshold
    levels = {"strength": 5}
    sessions = [
        _strong_session("strength")
        for _ in range(DEFAULT_STRONG_SESSIONS_PER_LEVEL - 1)
    ]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert — not yet "sustained"
    assert advanced["strength"] == 5


def test_level_advances_per_training_type_independently():
    # Arrange — sustained strong strength work; yoga only logged, never strong-enough
    levels = {"strength": 5, "yoga": 2}
    sessions = [
        _strong_session("strength") for _ in range(DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    ] + [_strong_session("yoga")]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert — strength moved, yoga did not
    assert advanced["strength"] == 6
    assert advanced["yoga"] == 2


def test_a_hard_set_disqualifies_a_session_from_counting_as_strong():
    # Arrange — three strength sessions, but each carries one near-maximal-effort set
    levels = {"strength": 5}
    hard = _SessionStub(
        training_type="strength",
        logged_sets=[
            _SetStub(perceived_difficulty=5),
            _SetStub(perceived_difficulty=LOW_EFFORT_MAX + 1),
        ],
    )
    sessions = [hard for _ in range(DEFAULT_STRONG_SESSIONS_PER_LEVEL)]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert — none counted, so no advancement
    assert advanced["strength"] == 5


def test_a_set_without_perceived_effort_disqualifies_the_session():
    # Arrange — strong-looking reps but the user never rated the effort
    levels = {"strength": 5}
    unrated = _SessionStub(
        training_type="strength",
        logged_sets=[_SetStub(perceived_difficulty=None)],
    )
    sessions = [unrated for _ in range(DEFAULT_STRONG_SESSIONS_PER_LEVEL)]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert — unrated effort is not evidence of comfort
    assert advanced["strength"] == 5


def test_a_session_with_no_logged_sets_is_not_strong():
    # Arrange — a logged-but-empty session is not "training performed comfortably"
    levels = {"strength": 5}
    sessions = [
        _SessionStub(training_type="strength", logged_sets=[])
        for _ in range(DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    ]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert
    assert advanced["strength"] == 5


def test_repeated_thresholds_fold_into_multiple_notches():
    # Arrange — twice the threshold of strong sessions
    levels = {"strength": 5}
    sessions = [
        _strong_session("strength")
        for _ in range(2 * DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    ]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert
    assert advanced["strength"] == 7


def test_folding_never_pushes_a_level_past_the_ceiling():
    # Arrange — already near the top, with far more than enough strong work
    levels = {"strength": MAX_FITNESS_LEVEL - 1}
    sessions = [
        _strong_session("strength")
        for _ in range(10 * DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    ]

    # Act
    advanced = advance_level(levels, sessions)

    # Assert — capped at the 1–10 ceiling
    assert advanced["strength"] == MAX_FITNESS_LEVEL


def test_sessions_per_notch_is_configurable():
    # Arrange — three strong sessions, but a stricter "sustained" bar of five
    levels = {"strength": 5}
    sessions = [_strong_session("strength") for _ in range(3)]

    # Act
    advanced = advance_level(levels, sessions, sessions_per_notch=5)

    # Assert — below the configured bar, so no advancement
    assert advanced["strength"] == 5
