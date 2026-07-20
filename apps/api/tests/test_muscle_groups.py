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
from datetime import date

import pytest

from app.domain.muscle_groups import (
    GROUP_ORDER,
    GroupCoverage,
    MuscleGroup,
    classify,
    covered_groups,
    distribution,
    recent_coverage,
    weekly_distribution,
)


@dataclass
class _LoggedSet:
    """Minimal stand-in carrying only the Exercise muscles ``distribution`` reads."""

    targeted_muscles: list[str] = field(default_factory=list)


@dataclass
class _LoggedSession:
    """Minimal stand-in for a Logged Session: just its ordered Logged Sets."""

    logged_sets: list[_LoggedSet] = field(default_factory=list)


@dataclass
class _DatedSession:
    """A Logged Session carrying the ``performed_on`` date the weekly series buckets on."""

    performed_on: date
    logged_sets: list[_LoggedSet] = field(default_factory=list)


# A Wednesday; its ISO week opens Monday 2026-07-06 and closes Sunday 2026-07-12.
_TODAY = date(2026, 7, 8)


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


# ``weekly_distribution`` — the per-week composition series (issue #178 / ADR-0024):
# the same even-split, set-count distribution as the snapshot, but bucketed by Monday
# into an ordered, oldest-first series of ``weeks`` weeks ending at the reference date.
# It is the one genuinely new computation in Strength Analytics; the snapshot only ever
# describes a single window.


def test_a_single_weeks_composition_matches_the_snapshot_rule():
    # Arrange — one session this week on a Legs-only Exercise; a one-week window
    history = [_DatedSession(_TODAY, [_LoggedSet(["quadriceps"])])]

    # Act
    series = weekly_distribution(history, reference=_TODAY, weeks=1)

    # Assert — a one-element series whose week is this Monday and whose composition is
    # the same 100%-Legs the snapshot ``distribution`` yields
    assert [week.week_start for week in series] == [date(2026, 7, 6)]
    assert series[0].composition == {MuscleGroup.LEGS: 100.0}


def test_each_week_is_normalized_independently_and_ordered_oldest_first():
    # Arrange — last week trained Legs only, this week trained Chest only
    history = [
        _DatedSession(date(2026, 7, 1), [_LoggedSet(["quadriceps"])]),  # last week
        _DatedSession(_TODAY, [_LoggedSet(["chest"])]),  # this week
    ]

    # Act
    series = weekly_distribution(history, reference=_TODAY, weeks=2)

    # Assert — oldest week first; each week sums to 100 over only what it trained
    assert [week.week_start for week in series] == [
        date(2026, 6, 29),
        date(2026, 7, 6),
    ]
    assert series[0].composition == {MuscleGroup.LEGS: 100.0}
    assert series[1].composition == {MuscleGroup.CHEST: 100.0}


def test_a_set_splits_evenly_across_groups_within_its_week():
    # Arrange — one compound set (Chest + Shoulders + Arms) this week
    history = [_DatedSession(_TODAY, [_LoggedSet(["chest", "front delts", "triceps"])])]

    # Act
    series = weekly_distribution(history, reference=_TODAY, weeks=1)

    # Assert — the week's single set splits into equal thirds, summing to 100
    assert series[0].composition == pytest.approx(
        {
            MuscleGroup.CHEST: 100 / 3,
            MuscleGroup.SHOULDERS: 100 / 3,
            MuscleGroup.ARMS: 100 / 3,
        }
    )


def test_a_week_with_no_training_is_an_honest_empty_week_not_dropped():
    # Arrange — training this week and two weeks ago, nothing in the week between
    history = [
        _DatedSession(date(2026, 6, 24), [_LoggedSet(["chest"])]),  # two weeks ago
        _DatedSession(_TODAY, [_LoggedSet(["quadriceps"])]),  # this week
    ]

    # Act — a three-week window spanning the gap week
    series = weekly_distribution(history, reference=_TODAY, weeks=3)

    # Assert — the middle week stays in the series with an empty composition, never dropped
    assert [week.week_start for week in series] == [
        date(2026, 6, 22),
        date(2026, 6, 29),
        date(2026, 7, 6),
    ]
    assert series[0].composition == {MuscleGroup.CHEST: 100.0}
    assert series[1].composition == {}
    assert series[2].composition == {MuscleGroup.LEGS: 100.0}


def test_a_sunday_and_the_next_monday_land_in_different_weeks():
    # Arrange — a session on Sunday 2026-07-12 and one on Monday 2026-07-13
    history = [
        _DatedSession(date(2026, 7, 12), [_LoggedSet(["chest"])]),  # Sunday
        _DatedSession(date(2026, 7, 13), [_LoggedSet(["quadriceps"])]),  # next Monday
    ]

    # Act — reference in the later (Monday-opened) week
    series = weekly_distribution(history, reference=date(2026, 7, 13), weeks=2)

    # Assert — the Sunday buckets to the 07-06 week, the Monday opens the 07-13 week
    assert [week.week_start for week in series] == [
        date(2026, 7, 6),
        date(2026, 7, 13),
    ]
    assert series[0].composition == {MuscleGroup.CHEST: 100.0}
    assert series[1].composition == {MuscleGroup.LEGS: 100.0}


def test_unclassified_sets_are_shown_in_their_week():
    # Arrange — a week whose only set trains an unmapped muscle
    history = [_DatedSession(_TODAY, [_LoggedSet(["unobtainium"])])]

    # Act
    series = weekly_distribution(history, reference=_TODAY, weeks=1)

    # Assert — the leftovers bucket is shown, never dropped
    assert series[0].composition == {MuscleGroup.UNCLASSIFIED: 100.0}


def test_sessions_outside_the_window_are_ignored():
    # Arrange — a session long before the window and one inside it
    history = [
        _DatedSession(date(2026, 1, 1), [_LoggedSet(["chest"])]),  # far past
        _DatedSession(_TODAY, [_LoggedSet(["quadriceps"])]),  # this week
    ]

    # Act — a two-week window that excludes the January session
    series = weekly_distribution(history, reference=_TODAY, weeks=2)

    # Assert — only in-window weeks appear; the far-past session contributes nothing
    assert [week.week_start for week in series] == [
        date(2026, 6, 29),
        date(2026, 7, 6),
    ]
    assert series[0].composition == {}
    assert series[1].composition == {MuscleGroup.LEGS: 100.0}


def test_an_all_empty_window_yields_zero_weeks_that_are_all_empty():
    # Arrange — a user who logged nothing in the window
    # Act
    series = weekly_distribution([], reference=_TODAY, weeks=3)

    # Assert — the window is still spanned, every week an honest empty composition
    assert len(series) == 3
    assert all(week.composition == {} for week in series)


def test_a_non_positive_week_count_yields_an_empty_series():
    # Arrange / Act / Assert — nothing to span, no error
    assert weekly_distribution([], reference=_TODAY, weeks=0) == []


# ``covered_groups`` — the shared "covered" predicate (issue #187): the set of the six
# real Muscle Groups a history has trained, Unclassified excluded. It is the single
# definition both the Muscle Group Coverage read and the Full Coverage Achievement lean
# on, so the two surfaces can never drift on what "covered" means.


def test_covered_groups_returns_the_real_groups_trained():
    # Arrange — a history training a Legs and a Chest muscle
    history = [
        _LoggedSession([_LoggedSet(["quadriceps"]), _LoggedSet(["chest"])]),
    ]

    # Act / Assert — exactly the two real groups those muscles roll up into
    assert covered_groups(history) == {MuscleGroup.LEGS, MuscleGroup.CHEST}


def test_covered_groups_of_an_empty_history_is_the_empty_set():
    # Arrange / Act / Assert — nothing trained, nothing covered (the honest empty state)
    assert covered_groups([]) == set()


def test_covered_groups_never_counts_the_unclassified_bucket():
    # Arrange — a history whose only sets train unmapped muscles (and an Exercise with
    # no muscles recorded at all), all of which fall to Unclassified
    history = [
        _LoggedSession([_LoggedSet(["unobtainium"]), _LoggedSet([])]),
    ]

    # Act / Assert — Unclassified is not one of the six, so nothing is covered
    assert covered_groups(history) == set()


def test_covered_groups_collapses_muscles_that_share_a_group():
    # Arrange — several muscles across the history that all roll up into Legs, plus one
    # unmapped muscle that must be ignored
    history = [
        _LoggedSession([_LoggedSet(["quadriceps", "hamstrings"])]),
        _LoggedSession([_LoggedSet(["calves"]), _LoggedSet(["unobtainium"])]),
    ]

    # Act / Assert — the shared group appears once; the unmapped muscle contributes nothing
    assert covered_groups(history) == {MuscleGroup.LEGS}


# ``recent_coverage`` — the neutral windowed presence signal (issue #188 / ADR-0025):
# each of the six real Muscle Groups reported trained / not-trained over the last
# ``weeks`` weeks relative to a reference date. Presence, not a threshold: one in-window
# set covers a group; work outside the window does not. Built on ``covered_groups`` so it
# can never disagree with the Full Coverage Achievement on what "covered" means.

# The six real groups in canonical order — the shape ``recent_coverage`` always returns,
# Unclassified never among them.
_REAL_GROUPS = tuple(g for g in GROUP_ORDER if g is not MuscleGroup.UNCLASSIFIED)


def _covered_map(coverage: tuple[GroupCoverage, ...]) -> dict[MuscleGroup, bool]:
    return {row.group: row.covered for row in coverage}


def test_recent_coverage_reports_each_real_group_trained_or_not_over_the_window():
    # Arrange — Legs trained inside the 8-week window; nothing else
    history = [_DatedSession(_TODAY, [_LoggedSet(["quadriceps"])])]

    # Act
    coverage = recent_coverage(history, reference=_TODAY, weeks=8)

    # Assert — Legs reads trained, the other five real groups read not-trained
    assert _covered_map(coverage) == {
        MuscleGroup.LEGS: True,
        MuscleGroup.CHEST: False,
        MuscleGroup.BACK: False,
        MuscleGroup.SHOULDERS: False,
        MuscleGroup.ARMS: False,
        MuscleGroup.CORE: False,
    }


def test_recent_coverage_a_group_trained_only_outside_the_window_reads_not_trained():
    # Arrange — _TODAY's week opens Mon 2026-07-06; an 8-week window reaches back to the
    # week of Mon 2026-05-18. Chest was last trained a day before that window opens.
    history = [_DatedSession(date(2026, 5, 17), [_LoggedSet(["chest"])])]

    # Act
    coverage = recent_coverage(history, reference=_TODAY, weeks=8)

    # Assert — the out-of-window Chest work does not count; nothing reads trained
    assert not any(row.covered for row in coverage)


def test_recent_coverage_the_earliest_week_in_the_window_still_counts():
    # Arrange — trained on the Monday the 8-week window opens (Mon 2026-05-18): the window
    # is inclusive of its eighth week back, matching the drift chart's oldest bar.
    history = [_DatedSession(date(2026, 5, 18), [_LoggedSet(["chest"])])]

    # Act
    coverage = recent_coverage(history, reference=_TODAY, weeks=8)

    # Assert — Chest, trained in the boundary week, reads trained
    assert _covered_map(coverage)[MuscleGroup.CHEST] is True


def test_recent_coverage_a_single_in_window_set_covers_a_group():
    # Arrange — one lone Core set inside the window: presence, not a threshold
    history = [_DatedSession(_TODAY, [_LoggedSet(["abs"])])]

    # Act / Assert — a single set is enough to read Core as trained
    coverage = recent_coverage(history, reference=_TODAY, weeks=8)
    assert _covered_map(coverage)[MuscleGroup.CORE] is True


def test_recent_coverage_always_returns_the_six_real_groups_in_canonical_order():
    # Arrange — a history training a mix; the shape must be all six real groups, ordered,
    # Unclassified never among them, regardless of what was trained
    history = [_DatedSession(_TODAY, [_LoggedSet(["quadriceps"]), _LoggedSet(["chest"])])]

    # Act
    coverage = recent_coverage(history, reference=_TODAY, weeks=8)

    # Assert — exactly REAL_GROUPS, in canonical body order, no Unclassified
    assert tuple(row.group for row in coverage) == _REAL_GROUPS
    assert MuscleGroup.UNCLASSIFIED not in {row.group for row in coverage}


def test_recent_coverage_of_an_empty_history_reads_six_not_trained_rows():
    # Arrange / Act — no history at all
    coverage = recent_coverage([], reference=_TODAY, weeks=8)

    # Assert — still the six real groups, every one not-trained (never dropped to zero rows)
    assert tuple(row.group for row in coverage) == _REAL_GROUPS
    assert all(row.covered is False for row in coverage)


def test_recent_coverage_ignores_unmapped_in_window_work():
    # Arrange — in-window training that rolls up only to Unclassified: it covers no real
    # group, so all six read not-trained (the Unclassified footnote is a separate slice)
    history = [_DatedSession(_TODAY, [_LoggedSet(["unobtainium"]), _LoggedSet([])])]

    # Act / Assert
    coverage = recent_coverage(history, reference=_TODAY, weeks=8)
    assert all(row.covered is False for row in coverage)
