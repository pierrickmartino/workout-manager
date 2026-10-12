"""Starting-weight prefill for a Curated Protocol's main lifts (issue #686, ADR-0130).

A user with logged history sees each main lift's starting weight derived from their Estimated
1RM for that lift — a working-weight fraction of it, rounded down to a loadable increment — and
marked as coming from their ``records``. A lift with no trustworthy history (never logged, or
only bodyweight, warm-up, or out-of-range sets) keeps the Curated Protocol's conservative
``default``. Computed at read time from Logged Sessions; nothing is stored."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.curated.beginner_linear import BEGINNER_LINEAR
from app.curated.prefill import StartingWeightPrefill, starting_weight_prefills
from app.domain.load import LoadKind, ParsedLoad
from tests.quantities import reps_quantity


@dataclass(frozen=True)
class _Set:
    exercise_name: str
    quantity: dict | None
    load: dict | None
    exercise_id: int = 1
    body_weight_kg: float | None = None
    set_type: str | None = None


@dataclass(frozen=True)
class _Session:
    performed_on: date
    logged_sets: list[_Set] = field(default_factory=list)


def _absolute(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _bodyweight() -> dict:
    return ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()


def _squat(kg: float, reps: int, **extra) -> _Set:
    return _Set("Barbell Back Squat", reps_quantity(reps), _absolute(kg), **extra)


def _history(*sets: _Set) -> list[_Session]:
    return [_Session(date(2026, 9, 1), list(sets))]


def test_a_lift_with_no_history_keeps_the_conservative_default():
    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, [])

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=20, source="default")
    assert prefills["deadlift"] == StartingWeightPrefill(kg=40, source="default")


def test_a_lift_with_an_estimated_1rm_is_prefilled_from_records_rounded_down():
    # Arrange — 100 kg × 5 is an Estimated 1RM of 116.7 kg; 70% is 81.7, down to 80 kg
    history = _history(_squat(100, 5))

    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, history)

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=80, source="records")
    assert prefills["bench"] == StartingWeightPrefill(kg=20, source="default")


def test_the_prefill_reads_the_best_estimated_1rm_across_the_history():
    # Arrange — 120 × 1 (1RM 120) beats 100 × 5 (116.7); 70% of 120 is 84, down to 82.5
    history = [
        _Session(date(2026, 9, 1), [_squat(120, 1)]),
        _Session(date(2026, 9, 8), [_squat(100, 5)]),
    ]

    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, history)

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=82.5, source="records")


def test_a_lift_matches_its_logged_exercise_by_normalized_name():
    # Arrange
    history = _history(_Set("  barbell back   SQUAT ", reps_quantity(1), _absolute(100)))

    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, history)

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=70, source="records")


def test_only_bodyweight_sets_keep_the_default():
    # Arrange — a bodyweight set with a captured mass carries an Estimated 1RM elsewhere,
    # but a starting weight is only ever derived from an absolute Load
    history = _history(
        _Set("Barbell Back Squat", reps_quantity(5), _bodyweight(), body_weight_kg=80)
    )

    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, history)

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=20, source="default")


def test_out_of_range_and_warm_up_sets_keep_the_default():
    # Arrange — 15 reps is outside the trustworthy window; a warm-up never counts
    history = _history(_squat(100, 15), _squat(140, 3, set_type="warm_up"))

    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, history)

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=20, source="default")


def test_an_estimate_below_one_loadable_increment_keeps_the_default():
    # Arrange — 3 kg × 1: 70% is 2.1 kg, which rounds down to nothing loadable
    history = _history(_squat(3, 1))

    # Act
    prefills = starting_weight_prefills(BEGINNER_LINEAR, history)

    # Assert
    assert prefills["squat"] == StartingWeightPrefill(kg=20, source="default")
