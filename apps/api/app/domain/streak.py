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

from app.domain.week import week_start as _week_start

_WEEK = timedelta(days=7)


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


def longest_week_run(session_dates: Iterable[date]) -> int:
    """Return the longest run of consecutive training weeks anywhere in the history.

    Unlike :func:`current_streak`, this is not anchored to the current week: it reports
    the best stretch the user ever strung together, so an old four-week run still counts
    and simply *not training this week* never erases it. Weeks are bucketed by their
    Monday, so several sessions in one week count once and a within-week rest day never
    breaks a run. A user who has logged nothing yields ``0``.

    It backs the streak-length Achievements (ADR-0018): monotonic in the chronological
    prefix — adding a later week can only extend or start a run — so the earliest date a
    given run length is reached is recoverable by replay, and it re-locks honestly if the
    logs behind the run are deleted.
    """

    weeks = sorted({_week_start(day) for day in session_dates})
    if not weeks:
        return 0

    longest = run = 1
    for previous, current in zip(weeks, weeks[1:]):
        run = run + 1 if current - previous == _WEEK else 1
        longest = max(longest, run)
    return longest


__all__ = ["current_streak", "longest_week_run"]
