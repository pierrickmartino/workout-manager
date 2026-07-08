"""The weekly Streak domain (F5 Slice 1) — consecutive-week consistency, honestly.

``current_streak`` counts the consecutive weeks, ending at the current week, in
which the user logged at least one Logged Session. It is deliberately **weekly, not
daily** (ADR-0019): a within-week rest day never breaks it, and the in-progress
current week is not held against a user who trained last week. Weeks are bucketed on
the same distinct-date basis as Analytics' active days, by ISO week.

These tests feed constructed session dates and assert the projected count, never
reaching into the week-bucketing internals — the one function owns every
week-boundary edge case."""

from __future__ import annotations

from datetime import date

from app.domain.streak import current_streak, longest_week_run

# A Wednesday; its ISO week runs Mon 2026-07-06 .. Sun 2026-07-12.
TODAY = date(2026, 7, 8)


def test_a_single_session_this_week_is_a_streak_of_one():
    # Arrange — one Logged Session in the current week
    dates = [date(2026, 7, 6)]

    # Act
    streak = current_streak(dates, TODAY)

    # Assert
    assert streak == 1


def test_empty_history_is_a_streak_of_zero():
    # Arrange — the user has logged nothing
    # Act / Assert — no error, just zero
    assert current_streak([], TODAY) == 0


def test_counts_consecutive_weeks():
    # Arrange — a session in each of the current week and the two before it
    dates = [
        date(2026, 7, 8),  # this week
        date(2026, 7, 1),  # last week
        date(2026, 6, 24),  # two weeks ago
    ]

    # Act / Assert
    assert current_streak(dates, TODAY) == 3


def test_a_gap_week_resets_the_streak():
    # Arrange — this week and last week, then a skipped week, then an older run
    dates = [
        date(2026, 7, 8),  # this week
        date(2026, 7, 1),  # last week
        # (week of 2026-06-22 skipped)
        date(2026, 6, 17),  # three weeks ago
    ]

    # Act — the run stops at the gap, so only the two recent weeks count
    assert current_streak(dates, TODAY) == 2


def test_a_within_week_rest_day_does_not_break_the_streak():
    # Arrange — two sessions in the current week with a rest day between them, and a
    # session last week: the extra rest day must not inflate or break the count
    dates = [
        date(2026, 7, 6),  # Monday this week
        date(2026, 7, 8),  # Wednesday this week (Tuesday was a rest day)
        date(2026, 7, 1),  # last week
    ]

    # Act — two consecutive weeks, counted once each despite the mid-week rest day
    assert current_streak(dates, TODAY) == 2


def test_in_progress_current_week_with_nothing_logged_yet_does_not_break():
    # Arrange — nothing logged this week yet, but the two prior weeks have sessions
    dates = [
        date(2026, 7, 1),  # last week
        date(2026, 6, 24),  # two weeks ago
    ]

    # Act — the empty in-progress current week is not held against the user; the
    # streak is measured as of last week
    assert current_streak(dates, TODAY) == 2


def test_a_stale_last_session_two_weeks_ago_is_a_broken_streak():
    # Arrange — the most recent session is two weeks old: neither this week nor last
    # week has one, so the run is broken
    dates = [date(2026, 6, 24)]

    # Act / Assert
    assert current_streak(dates, TODAY) == 0


# ``longest_week_run`` — the longest run of consecutive training weeks *anywhere* in the
# history, not anchored to the current week. It backs the streak-length Achievements
# (F5 Slice 3): "reach a 4-week streak" asks whether the user ever strung four
# consecutive weeks together, so an old run counts and a break today never erases it.


def test_longest_run_of_an_empty_history_is_zero():
    # Arrange / Act / Assert — nothing logged, no run, no error
    assert longest_week_run([]) == 0


def test_longest_run_counts_the_best_consecutive_stretch_not_the_current_one():
    # Arrange — an old four-week run, a gap, then a recent two-week run
    dates = [
        date(2026, 2, 2),  # week 1
        date(2026, 2, 9),  # week 2
        date(2026, 2, 16),  # week 3
        date(2026, 2, 23),  # week 4
        # (gap)
        date(2026, 7, 1),  # recent week
        date(2026, 7, 8),  # recent week + 1
    ]

    # Act — the best stretch is the old four-week run, even though it is not current
    assert longest_week_run(dates) == 4


def test_longest_run_ignores_within_week_repeats():
    # Arrange — three sessions in one week and one the next: two consecutive weeks
    dates = [
        date(2026, 7, 6),
        date(2026, 7, 7),
        date(2026, 7, 8),
        date(2026, 7, 13),  # next week
    ]

    # Act / Assert — the run is measured in weeks, not sessions
    assert longest_week_run(dates) == 2
