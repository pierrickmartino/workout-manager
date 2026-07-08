"""The weekly Streak — consecutive weeks of training consistency, derived read-time.

``current_streak`` counts the consecutive weeks, ending at the current week, in which
the user logged at least one Logged Session. It is deliberately **weekly, not daily**
(ADR-0019): the plan model is calendar-free, and a daily streak would pressure users
to train through the rest days the domain's safety posture treats as legitimate. So a
within-week rest day never breaks the run, and an in-progress current week with nothing
logged yet is not counted against a user who trained last week.

Weeks are bucketed by their Monday (ISO week start), the same distinct-date basis as
Analytics' active days. Any Logged Session keeps a week alive regardless of Completion
Outcome — this counts work performed, not plan adherence.

Pure and dependency-free: it takes the dates the sessions were performed on and a
reference ``today``, and returns an integer. No ORM, no HTTP."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta

_WEEK = timedelta(days=7)


def _week_start(day: date) -> date:
    """The Monday of ``day``'s ISO week — the canonical bucket for that week."""

    return day - timedelta(days=day.weekday())


def current_streak(session_dates: Iterable[date], today: date) -> int:
    """Return the count of consecutive weeks with >=1 Logged Session, ending now.

    Counting anchors at the current week when it has a session, otherwise at last
    week (the current week may simply be in progress) — and walks backwards a week
    at a time, stopping at the first week with no logged session. A user who has
    logged nothing yields ``0``.
    """

    weeks = {_week_start(day) for day in session_dates}
    if not weeks:
        return 0

    this_week = _week_start(today)
    if this_week in weeks:
        cursor = this_week
    elif this_week - _WEEK in weeks:
        # The current week is in progress with nothing logged yet — the streak is
        # not broken, so it is measured as of last week.
        cursor = this_week - _WEEK
    else:
        return 0

    streak = 0
    while cursor in weeks:
        streak += 1
        cursor -= _WEEK
    return streak


__all__ = ["current_streak"]
