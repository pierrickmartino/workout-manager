"""Degrade-to-flat: the generation remedy for an invalid Superset (ADR-0023).

The generation parse boundary is passive, so an invalid generated Superset is
*ungrouped* (its Prescriptions kept, the group tag + round-rest dropped) rather
than failing the whole request. These tests pin that pure transform directly —
valid groups pass through untouched, only offending groups flatten, and the input
models are never mutated (immutability)."""

from __future__ import annotations

import copy

from app.generation.schema import GeneratedExercisePrescription
from app.generation.superset_degrade import degrade_prescriptions_to_flat


def _p(name: str, *, sets: int = 3, group: str | None = None, round_rest: int | None = None):
    return GeneratedExercisePrescription(
        exercise_name=name,
        sets=sets,
        reps="10",
        superset_group=group,
        round_rest_seconds=round_rest,
    )


def test_a_valid_group_passes_through_unchanged():
    # Arrange — two contiguous, equal-count members with a round-rest
    prescriptions = [
        _p("Curl", group="ss1", round_rest=90),
        _p("Pushdown", group="ss1", round_rest=90),
    ]

    # Act
    result = degrade_prescriptions_to_flat(prescriptions)

    # Assert — grouping intact
    assert [p.superset_group for p in result] == ["ss1", "ss1"]
    assert [p.round_rest_seconds for p in result] == [90, 90]


def test_an_uneven_group_is_ungrouped():
    # Arrange — unequal set counts break the "N rounds" invariant
    prescriptions = [
        _p("Curl", sets=3, group="ss1", round_rest=90),
        _p("Pushdown", sets=4, group="ss1", round_rest=90),
    ]

    # Act
    result = degrade_prescriptions_to_flat(prescriptions)

    # Assert — both kept, ungrouped, round-rest cleared
    assert [p.exercise_name for p in result] == ["Curl", "Pushdown"]
    assert all(p.superset_group is None for p in result)
    assert all(p.round_rest_seconds is None for p in result)


def test_only_the_offending_group_is_flattened():
    # Arrange — ss1 valid, ss2 uneven
    prescriptions = [
        _p("Curl", group="ss1", round_rest=90),
        _p("Pushdown", group="ss1", round_rest=90),
        _p("Row", sets=4, group="ss2", round_rest=60),
        _p("Fly", sets=3, group="ss2", round_rest=60),
    ]

    # Act
    result = degrade_prescriptions_to_flat(prescriptions)

    # Assert
    assert [p.superset_group for p in result] == ["ss1", "ss1", None, None]


def test_does_not_mutate_the_input_prescriptions():
    # Arrange — an offending group whose members would be flattened
    prescriptions = [
        _p("Curl", sets=3, group="ss1", round_rest=90),
        _p("Pushdown", sets=4, group="ss1", round_rest=90),
    ]
    snapshot = copy.deepcopy(prescriptions)

    # Act
    degrade_prescriptions_to_flat(prescriptions)

    # Assert — the source list is untouched (new objects returned instead)
    assert prescriptions == snapshot
