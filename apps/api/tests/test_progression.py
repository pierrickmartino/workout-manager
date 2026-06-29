"""Behavior of the Progression domain module: the deterministic, no-AI
``next_load`` adjustment (ADR-0004). It is a pure function over a prescription and
the user's Logged Sets — strong performance nudges the recommended load up, missed
reps back it off, and anything it cannot read numerically is left untouched. No
mocks: the inputs are plain stubs."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.progression import next_load


@dataclass
class _Prescription:
    """Minimal stand-in carrying only what ``next_load`` reads off a prescription."""

    reps: str
    recommended_load: str | None


@dataclass
class _LoggedSet:
    """Minimal stand-in for one performed set."""

    reps: int
    perceived_difficulty: int | None = None


def test_no_logged_sets_holds_the_recommended_load():
    # Arrange — nothing performed yet
    prescription = _Prescription(reps="5", recommended_load="60 kg")

    # Act
    result = next_load(prescription, [])

    # Assert — with no evidence to act on, the recommendation is unchanged
    assert result == "60 kg"


def test_all_reps_hit_at_low_effort_increases_the_load():
    # Arrange — every set met the target and felt easy
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — strong performance bumps the recommended load up
    assert result == "62.5 kg"


def test_missed_reps_reduce_the_load():
    # Arrange — the user fell short of the prescribed reps on a set
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [
        _LoggedSet(reps=5, perceived_difficulty=8),
        _LoggedSet(reps=3, perceived_difficulty=9),
    ]

    # Act
    result = next_load(prescription, sets)

    # Assert — missing reps backs the recommended load off
    assert result == "55 kg"


def test_reps_hit_at_high_effort_holds_the_load():
    # Arrange — every rep made, but it was a grind
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=9) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — hard sets hold; only easy ones earn more load
    assert result == "60 kg"


def test_missing_perceived_effort_holds_rather_than_increases():
    # Arrange — reps hit, but the user did not record effort
    prescription = _Prescription(reps="5", recommended_load="60 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=None) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — without evidence the work was easy, the load only holds
    assert result == "60 kg"


def test_a_rep_range_increases_only_when_the_ceiling_is_reached():
    # Arrange — top of an 8–12 range at low effort
    prescription = _Prescription(reps="8-12", recommended_load="40 kg")
    sets = [_LoggedSet(reps=12, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — double-progression: ceiling reached → step the load up
    assert result == "42.5 kg"


def test_a_rep_range_holds_in_the_middle_of_the_range():
    # Arrange — within the range (>= floor, < ceiling)
    prescription = _Prescription(reps="8-12", recommended_load="40 kg")
    sets = [_LoggedSet(reps=10, perceived_difficulty=6) for _ in range(3)]

    # Act
    result = next_load(prescription, sets)

    # Assert — keep accumulating reps before adding load
    assert result == "40 kg"


def test_a_rep_range_reduces_when_a_set_drops_below_the_floor():
    # Arrange — a set fell under the bottom of the 8–12 range
    prescription = _Prescription(reps="8-12", recommended_load="40 kg")
    sets = [
        _LoggedSet(reps=12, perceived_difficulty=7),
        _LoggedSet(reps=7, perceived_difficulty=9),
    ]

    # Act
    result = next_load(prescription, sets)

    # Assert
    assert result == "35 kg"


def test_a_load_with_no_unit_is_adjusted_numerically():
    # Arrange — a bare number
    prescription = _Prescription(reps="5", recommended_load="60")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert — the number moves, the (empty) suffix is preserved
    assert next_load(prescription, sets) == "62.5"


def test_a_load_with_a_glued_unit_preserves_its_formatting():
    # Arrange — no space between number and unit
    prescription = _Prescription(reps="5", recommended_load="60kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "62.5kg"


def test_a_non_numeric_load_is_left_untouched():
    # Arrange — bodyweight movement: nothing to add a kilo to
    prescription = _Prescription(reps="5", recommended_load="bodyweight")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "bodyweight"


def test_a_percentage_load_is_left_untouched():
    # Arrange — a %-1RM load has digits in its suffix; refuse to guess
    prescription = _Prescription(reps="5", recommended_load="70% 1RM")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "70% 1RM"


def test_a_range_valued_load_is_left_untouched():
    # Arrange — "70-80 kg" has no single number to move
    prescription = _Prescription(reps="5", recommended_load="70-80 kg")
    sets = [_LoggedSet(reps=5, perceived_difficulty=6) for _ in range(3)]

    # Act / Assert
    assert next_load(prescription, sets) == "70-80 kg"


def test_an_unparseable_rep_target_holds_the_load():
    # Arrange — "AMRAP" gives no numeric target to judge against
    prescription = _Prescription(reps="AMRAP", recommended_load="60 kg")
    sets = [_LoggedSet(reps=20, perceived_difficulty=6)]

    # Act / Assert
    assert next_load(prescription, sets) == "60 kg"


def test_a_null_load_stays_null():
    # Arrange — no recommendation to adjust
    prescription = _Prescription(reps="5", recommended_load=None)
    sets = [_LoggedSet(reps=5, perceived_difficulty=6)]

    # Act / Assert
    assert next_load(prescription, sets) is None


def test_a_reduction_never_drops_below_zero():
    # Arrange — a light load with missed reps
    prescription = _Prescription(reps="5", recommended_load="2 kg")
    sets = [_LoggedSet(reps=1, perceived_difficulty=10)]

    # Act / Assert — clamped at zero, never negative
    assert next_load(prescription, sets) == "0 kg"
