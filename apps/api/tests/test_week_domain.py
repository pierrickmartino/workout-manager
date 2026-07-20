"""The shared week basis (issue #178) — one Monday/ISO week-start helper both the
Streak and the weekly Muscle-Group balance bucket on, so the two can never disagree
on where a week begins.

``week_start`` maps any date to the Monday of its ISO week. It is the single basis
lifted out of ``domain/streak`` and imported by both callers; these tests pin the
week-boundary edge cases (mid-week, the Monday itself, the Sunday end) so a future
refactor cannot quietly shift the boundary."""

from __future__ import annotations

from datetime import date

from app.domain.week import week_start


def test_a_midweek_day_buckets_to_its_monday():
    # Arrange — a Wednesday
    # Act / Assert — its ISO week starts on the preceding Monday
    assert week_start(date(2026, 7, 8)) == date(2026, 7, 6)


def test_a_monday_is_its_own_week_start():
    # Arrange — the Monday itself
    # Act / Assert — a week boundary maps to itself, not the week before
    assert week_start(date(2026, 7, 6)) == date(2026, 7, 6)


def test_a_sunday_buckets_to_the_monday_that_opened_its_week():
    # Arrange — the Sunday that ends the week
    # Act / Assert — still the same Monday, so the week closes on its Sunday
    assert week_start(date(2026, 7, 12)) == date(2026, 7, 6)
