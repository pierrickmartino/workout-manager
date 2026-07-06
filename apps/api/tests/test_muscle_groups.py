"""Behavior of the Muscle Groups domain module (F3 Analytics, Slice 2): the pure,
curated roll-up from an Exercise's free-form ``targeted_muscles`` into the six
coarse Muscle Groups — Legs, Chest, Back, Shoulders, Arms, Core — plus an explicit
Unclassified bucket, and the set-count ``distribution`` weighted by an even split
across each Exercise's distinct groups.

The mapping is curated, not AI-derived (ADR-0011): a muscle with no known mapping
lands in Unclassified rather than being silently dropped. ``distribution`` is
purely set-count based — no Load, no Estimated 1RM — so a heavy lift never
dominates the split. No mocks: the inputs are plain stubs, mirroring
``test_progression.py``."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.domain.muscle_groups import MuscleGroup, classify, distribution


@dataclass
class _LoggedSet:
    """Minimal stand-in carrying only the Exercise muscles ``distribution`` reads."""

    targeted_muscles: list[str] = field(default_factory=list)


@dataclass
class _LoggedSession:
    """Minimal stand-in for a Logged Session: just its ordered Logged Sets."""

    logged_sets: list[_LoggedSet] = field(default_factory=list)


def test_a_known_muscle_rolls_up_into_its_curated_group():
    # Arrange / Act / Assert — a quad is a Legs muscle
    assert classify("quadriceps") == MuscleGroup.LEGS


def test_each_curated_group_has_a_representative_muscle():
    # Arrange / Act / Assert — one free-form muscle per real group rolls up right
    assert classify("chest") == MuscleGroup.CHEST
    assert classify("lats") == MuscleGroup.BACK
    assert classify("deltoids") == MuscleGroup.SHOULDERS
    assert classify("biceps") == MuscleGroup.ARMS
    assert classify("obliques") == MuscleGroup.CORE


def test_an_unmapped_muscle_lands_in_unclassified_rather_than_being_dropped():
    # Arrange — a muscle the curated map has never heard of (e.g. AI-invented)
    # Act / Assert — it is bucketed as Unclassified, never silently dropped
    assert classify("sternocleidomastoid") == MuscleGroup.UNCLASSIFIED


def test_classification_ignores_casing_and_surrounding_whitespace():
    # Arrange — the catalog emits free-form text with inconsistent casing/spacing
    # Act / Assert — the normalized key still resolves to the curated group
    assert classify("  Quadriceps  ") == MuscleGroup.LEGS
    assert classify("LATISSIMUS   DORSI") == MuscleGroup.BACK


def test_a_single_set_is_wholly_its_one_group():
    # Arrange — one logged set on an Exercise that only trains Legs
    history = [_LoggedSession([_LoggedSet(["quadriceps"])])]

    # Act
    result = distribution(history)

    # Assert — the whole set weight lands on Legs: 100%
    assert result == {MuscleGroup.LEGS: 100.0}


def test_empty_history_yields_an_empty_distribution():
    # Arrange — a user who has logged nothing (the honest empty state)
    # Act / Assert — no groups, not an error
    assert distribution([]) == {}


def test_a_session_with_no_sets_contributes_nothing():
    # Arrange — a logged session that recorded no sets at all
    # Act / Assert — nothing to weigh, so the distribution is empty
    assert distribution([_LoggedSession([])]) == {}


def test_a_set_splits_evenly_across_its_exercises_distinct_groups():
    # Arrange — one set on a compound lift that trains Chest, Shoulders, and Arms
    history = [_LoggedSession([_LoggedSet(["chest", "front delts", "triceps"])])]

    # Act
    result = distribution(history)

    # Assert — the single set's weight is split into equal thirds, summing to 100
    # (exact floats; thirds are compared within FP tolerance)
    assert result == pytest.approx(
        {
            MuscleGroup.CHEST: 100 / 3,
            MuscleGroup.SHOULDERS: 100 / 3,
            MuscleGroup.ARMS: 100 / 3,
        }
    )


def test_muscles_that_share_a_group_collapse_to_one_share():
    # Arrange — two muscles on the same Exercise that both roll up into Legs
    history = [_LoggedSession([_LoggedSet(["quadriceps", "hamstrings"])])]

    # Act
    result = distribution(history)

    # Assert — the split is across *distinct groups*, so Legs still gets it all
    assert result == {MuscleGroup.LEGS: 100.0}


def test_weighting_is_by_set_count_so_no_single_lift_dominates():
    # Arrange — three isolation sets on Legs vs. one compound set (Chest+Arms).
    # Set count, not load, drives the split: the compound is still just one set.
    legs = _LoggedSession([_LoggedSet(["quadriceps"]) for _ in range(3)])
    bench = _LoggedSession([_LoggedSet(["chest", "triceps"])])
    history = [legs, bench]

    # Act
    result = distribution(history)

    # Assert — 4 sets total; Legs = 3 whole sets, Chest & Arms = half a set each.
    assert result[MuscleGroup.LEGS] == 75.0
    assert result[MuscleGroup.CHEST] == 12.5
    assert result[MuscleGroup.ARMS] == 12.5


def test_percentages_always_sum_to_one_hundred():
    # Arrange — a mixed history that produces awkward thirds and halves
    history = [
        _LoggedSession([_LoggedSet(["chest", "shoulders", "triceps"])]),
        _LoggedSession([_LoggedSet(["quadriceps"]), _LoggedSet(["abs", "obliques"])]),
    ]

    # Act
    result = distribution(history)

    # Assert — however the weight is split, the shares are exhaustive
    assert sum(result.values()) == pytest.approx(100.0)


def test_an_exercise_with_no_muscles_counts_as_unclassified():
    # Arrange — a logged set whose Exercise recorded no targeted muscles at all
    history = [_LoggedSession([_LoggedSet([])])]

    # Act / Assert — the set is shown as Unclassified, not dropped from the total
    assert distribution(history) == {MuscleGroup.UNCLASSIFIED: 100.0}


def test_groups_are_returned_in_canonical_body_order_unclassified_last():
    # Arrange — one set touching several groups plus an unmapped muscle, logged out
    # of canonical order
    history = [
        _LoggedSession([_LoggedSet(["obliques", "quadriceps", "chest", "unobtainium"])])
    ]

    # Act
    result = distribution(history)

    # Assert — insertion order follows GROUP_ORDER: Legs, Chest, Core, Unclassified
    assert list(result.keys()) == [
        MuscleGroup.LEGS,
        MuscleGroup.CHEST,
        MuscleGroup.CORE,
        MuscleGroup.UNCLASSIFIED,
    ]
