"""Behavior of the Profile & Level domain module: the derived ``is_sensitive``
predicate that gates the generation safety bypass (ADR-0003), and
``effective_fitness_levels``, which reads the **Effective Fitness Level** per training
type from a window of the most recent Logged Sessions of that type (ADR-0112).

Both are *derived*: the bypass from the stored specific constraint types, never a
standalone boolean; the Effective level from the **Declared** level plus net recent
evidence, never persisted in place of the Declared baseline (ADR-0018).

These tests assert external behaviour only — given this history and this Declared level,
this is the level the app plans with — never that a helper ran or how an intermediate is
shaped."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.domain.completion import CompletionOutcome
from app.domain.effort import HIGH_EFFORT_MIN
from app.domain.fitness_profile import (
    DEFAULT_EFFECTIVE_LEVEL_WINDOW,
    DEFAULT_STRONG_SESSIONS_PER_LEVEL,
    MAX_FITNESS_LEVEL,
    SensitiveConstraintType,
    effective_fitness_levels,
    is_sensitive,
    resolve_equipment,
)
from app.domain.progression import LOW_EFFORT_MAX


# --- resolve_equipment: request Available Equipment over Profile Default ---


def test_omitted_request_equipment_falls_back_to_default_equipment():
    # Arrange — a request that states no equipment inherits the saved Default
    default_equipment = ["dumbbells", "pull-up bar"]

    # Act
    available = resolve_equipment(None, default_equipment)

    # Assert
    assert available == ["dumbbells", "pull-up bar"]


def test_explicitly_empty_request_equipment_is_honored_as_bodyweight_only():
    # Arrange — a user with saved defaults clears the field to request bodyweight
    default_equipment = ["dumbbells", "pull-up bar"]

    # Act
    available = resolve_equipment([], default_equipment)

    # Assert — empty is a real choice, never a fallback to the Default
    assert available == []


def test_stated_request_equipment_replaces_the_default():
    # Arrange — the request names its own kit for this generation
    default_equipment = ["dumbbells"]

    # Act
    available = resolve_equipment(["barbell", "rack"], default_equipment)

    # Assert — replace, never merge (GLOSSARY: Available Equipment replaces Default)
    assert available == ["barbell", "rack"]


def test_resolve_equipment_does_not_mutate_its_inputs():
    # Arrange
    default_equipment = ["dumbbells"]
    request_equipment = ["barbell"]

    # Act
    resolve_equipment(request_equipment, default_equipment)

    # Assert — both inputs are left untouched (immutability rule)
    assert default_equipment == ["dumbbells"]
    assert request_equipment == ["barbell"]


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


# --- effective_fitness_levels: reading the recent record (ADR-0112) ---

#: The most notches a full window of nothing but comfortable Sessions can earn.
MAX_NOTCHES = DEFAULT_EFFECTIVE_LEVEL_WINDOW // DEFAULT_STRONG_SESSIONS_PER_LEVEL


@dataclass
class _SetStub:
    """A logged set carrying only the rated effort the fold reads.

    ``None`` is an *unrated* set — the field is optional at the log boundary, which is
    the whole reason the fold abstains on it rather than disqualifying its Session."""

    perceived_difficulty: int | None = None


@dataclass
class _SessionStub:
    """A Logged Session: its training type, its Completion Outcome, and its sets."""

    training_type: str
    completion_outcome: str | None = None
    logged_sets: list[_SetStub] = field(default_factory=list)


def _comfortable(training_type: str = "strength") -> _SessionStub:
    """Completed, and every rated set sat at or below the low-effort threshold."""

    return _SessionStub(
        training_type=training_type,
        completion_outcome=CompletionOutcome.COMPLETED.value,
        logged_sets=[_SetStub(perceived_difficulty=LOW_EFFORT_MAX)],
    )


def _strained_by_effort(training_type: str = "strength") -> _SessionStub:
    """Completed, but a set was ground out at or above the high-effort threshold."""

    return _SessionStub(
        training_type=training_type,
        completion_outcome=CompletionOutcome.COMPLETED.value,
        logged_sets=[_SetStub(perceived_difficulty=HIGH_EFFORT_MIN)],
    )


def _strained_by_outcome(training_type: str = "strength") -> _SessionStub:
    """Declared Incomplete — prescribed work was left un-attempted."""

    return _SessionStub(
        training_type=training_type,
        completion_outcome=CompletionOutcome.INCOMPLETE.value,
        logged_sets=[_SetStub(perceived_difficulty=LOW_EFFORT_MAX)],
    )


def _unrated(
    training_type: str = "strength",
    *,
    outcome: str | None = CompletionOutcome.COMPLETED.value,
) -> _SessionStub:
    """A Session whose sets carry no effort rating at all."""

    return _SessionStub(
        training_type=training_type,
        completion_outcome=outcome,
        logged_sets=[_SetStub(perceived_difficulty=None)],
    )


def _repeat(session: _SessionStub, count: int) -> list[_SessionStub]:
    return [session for _ in range(count)]


# --- quorum: too little record reads as exactly the Declared level ---


def test_a_training_type_with_no_history_reads_at_the_declared_level():
    # Arrange
    declared = {"strength": 5, "yoga": 2}

    # Act
    effective = effective_fitness_levels(declared, [])

    # Assert
    assert effective == {"strength": 5, "yoga": 2}


def test_a_window_below_quorum_reads_at_exactly_the_declared_level():
    # Arrange — comfortable work, but one Session short of the quorum
    declared = {"strength": 5}
    history = _repeat(_comfortable(), DEFAULT_STRONG_SESSIONS_PER_LEVEL - 1)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — not enough record to read anything into
    assert effective["strength"] == 5


def test_quorum_is_counted_per_training_type():
    # Arrange — strength clears the quorum, yoga does not, in one history
    declared = {"strength": 5, "yoga": 2}
    history = _repeat(_comfortable("strength"), DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    history += _repeat(_comfortable("yoga"), DEFAULT_STRONG_SESSIONS_PER_LEVEL - 1)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert
    assert effective["strength"] == 6
    assert effective["yoga"] == 2


# --- comfortable: earned credit ---


def test_a_quorum_of_comfortable_sessions_earns_one_notch():
    # Arrange
    declared = {"strength": 5}
    history = _repeat(_comfortable(), DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert
    assert effective["strength"] == 6


def test_an_unrated_set_abstains_rather_than_voiding_its_session():
    # Arrange — each Session rates one set comfortably and leaves the other blank
    declared = {"strength": 5}
    partly_rated = _SessionStub(
        training_type="strength",
        completion_outcome=CompletionOutcome.COMPLETED.value,
        logged_sets=[
            _SetStub(perceived_difficulty=LOW_EFFORT_MAX),
            _SetStub(perceived_difficulty=None),
        ],
    )
    history = _repeat(partly_rated, DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — read from the sets they did rate
    assert effective["strength"] == 6


def test_a_completed_but_wholly_unrated_window_reads_at_the_declared_level():
    # Arrange — a full window finished, with not one set rated
    declared = {"strength": 5}
    history = _repeat(_unrated(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — no credit for mere adherence
    assert effective["strength"] == 5


def test_a_wholly_unrated_session_still_counts_on_its_completion_outcome():
    # Arrange — half the window comfortable, half Incomplete with nothing rated
    half = DEFAULT_EFFECTIVE_LEVEL_WINDOW // 2
    declared = {"strength": 5}
    history = _repeat(_comfortable(), half)
    history += _repeat(_unrated(outcome=CompletionOutcome.INCOMPLETE.value), half)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — neutral on effort, yet the Incomplete outcome still cancels the credit
    assert effective["strength"] == 5


def test_a_wholly_unrated_session_occupies_its_place_in_the_window():
    # Arrange — a full window of Completed-but-unrated work above an older comfortable run
    declared = {"strength": 5}
    history = _repeat(_unrated(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)
    history += _repeat(_comfortable(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — "no effort evidence" is not "no session": the unrated Sessions fill the
    # window and push the older credit out of it rather than being skipped over
    assert effective["strength"] == 5


def test_an_undeclared_completion_outcome_is_neither_comfortable_nor_strained():
    # Arrange — a log-after-the-fact record that declared no outcome, rated comfortably
    declared = {"strength": 5}
    history = _repeat(
        _SessionStub(
            training_type="strength",
            completion_outcome=None,
            logged_sets=[_SetStub(perceived_difficulty=LOW_EFFORT_MAX)],
        ),
        DEFAULT_EFFECTIVE_LEVEL_WINDOW,
    )

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — comfort requires a declared Completed, so this is no evidence either way
    assert effective["strength"] == 5


# --- strained: withdrawn credit, floored at the Declared level ---


def test_comfortable_and_strained_are_mutually_exclusive():
    # Arrange — half the window comfortable, half Completed but with one set ground out
    half = DEFAULT_EFFECTIVE_LEVEL_WINDOW // 2
    declared = {"strength": 5}
    mixed_effort = _SessionStub(
        training_type="strength",
        completion_outcome=CompletionOutcome.COMPLETED.value,
        logged_sets=[
            _SetStub(perceived_difficulty=LOW_EFFORT_MAX),
            _SetStub(perceived_difficulty=HIGH_EFFORT_MIN),
        ],
    )
    history = _repeat(_comfortable(), half) + _repeat(mixed_effort, half)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — the hard Session is strained *only*; counted as both it would net +2
    assert effective["strength"] == 5


def test_strained_sessions_withdraw_earned_credit():
    # Arrange — six comfortable Sessions would be two notches on their own
    declared = {"strength": 5}
    history = _repeat(_comfortable(), 2 * DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    history += _repeat(_strained_by_outcome(), DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — one notch's worth of credit withdrawn
    assert effective["strength"] == 6


def test_a_strained_window_never_reads_below_the_declared_level():
    # Arrange — a full window of Incomplete work
    declared = {"strength": 5}
    history = _repeat(_strained_by_outcome(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — the Declared level is a floor, never a starting point to fall from
    assert effective["strength"] == 5


def test_near_maximum_effort_strains_a_session_that_was_completed():
    # Arrange — every Session finished, every Session ground out
    declared = {"strength": 5}
    history = _repeat(_strained_by_effort(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert
    assert effective["strength"] == 5


# --- the bound, the ceiling, and idempotence ---


def test_a_full_comfortable_window_reads_at_most_four_notches_above_declared():
    # Arrange — far more comfortable work than the window can hold
    declared = {"strength": 5}
    history = _repeat(_comfortable(), 10 * DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — bounded by the window, not by the length of the record
    assert MAX_NOTCHES == 4
    assert effective["strength"] == 5 + MAX_NOTCHES


def test_the_effective_level_never_passes_the_scale_ceiling():
    # Arrange — already near the top, with a full comfortable window
    declared = {"strength": MAX_FITNESS_LEVEL - 1}
    history = _repeat(_comfortable(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert
    assert effective["strength"] == MAX_FITNESS_LEVEL


def test_re_reading_one_history_yields_the_same_levels_and_never_mutates_declared():
    # Arrange
    declared = {"strength": 5}
    history = _repeat(_comfortable(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act — the read-time projection, taken twice over the same record
    first = effective_fitness_levels(declared, history)
    second = effective_fitness_levels(declared, history)

    # Assert — no double counting, and the Declared baseline is untouched
    assert first == second
    assert declared == {"strength": 5}


# --- per-type isolation ---


def test_each_training_type_is_read_from_its_own_sessions():
    # Arrange — comfortable strength work alongside Incomplete yoga work
    declared = {"strength": 5, "yoga": 2}
    history = _repeat(_comfortable("strength"), DEFAULT_EFFECTIVE_LEVEL_WINDOW)
    history += _repeat(_strained_by_outcome("yoga"), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert
    assert effective["strength"] == 5 + MAX_NOTCHES
    assert effective["yoga"] == 2


def test_one_types_sessions_never_consume_anothers_window():
    # Arrange — a full comfortable strength window, interleaved with unrelated yoga work
    declared = {"strength": 5, "yoga": 2}
    history: list[_SessionStub] = []
    for _ in range(DEFAULT_EFFECTIVE_LEVEL_WINDOW):
        history.append(_comfortable("strength"))
        history.append(_unrated("yoga"))

    # Act
    effective = effective_fitness_levels(declared, history)

    # Assert — strength's window is full of its own Sessions, not crowded out
    assert effective["strength"] == 5 + MAX_NOTCHES


# --- the newest-first ordering precondition ---


def test_the_window_reads_the_newest_sessions_the_history_is_handed_in_order():
    # Arrange — a strained recent run above an older comfortable one, newest first
    declared = {"strength": 5}
    recent_strain = _repeat(_strained_by_outcome(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)
    older_comfort = _repeat(_comfortable(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    newest_first = effective_fitness_levels(declared, recent_strain + older_comfort)
    oldest_first = effective_fitness_levels(declared, older_comfort + recent_strain)

    # Assert — the order is load-bearing: newest-first reads the strain and floors,
    # the same history handed oldest-first reads the stale credit instead
    assert newest_first["strength"] == 5
    assert oldest_first["strength"] == 5 + MAX_NOTCHES


# --- the tunable parameters ---


def test_the_window_length_is_tunable():
    # Arrange — a short window drops the older comfortable Sessions out of sight
    declared = {"strength": 5}
    history = _repeat(_strained_by_outcome(), DEFAULT_STRONG_SESSIONS_PER_LEVEL)
    history += _repeat(_comfortable(), DEFAULT_EFFECTIVE_LEVEL_WINDOW)

    # Act
    effective = effective_fitness_levels(
        declared, history, window=DEFAULT_STRONG_SESSIONS_PER_LEVEL
    )

    # Assert — only the strained Sessions are in the window
    assert effective["strength"] == 5


def test_sessions_per_notch_is_tunable():
    # Arrange — three comfortable Sessions against a stricter bar of five
    declared = {"strength": 5}
    history = _repeat(_comfortable(), 3)

    # Act
    effective = effective_fitness_levels(declared, history, sessions_per_notch=5)

    # Assert — below the configured quorum
    assert effective["strength"] == 5
