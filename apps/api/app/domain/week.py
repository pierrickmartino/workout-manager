"""The shared week basis — one Monday/ISO week-start helper, so every weekly
projection agrees on where a week begins.

Weeks in this domain are calendar-free but bucketed by their **Monday** (ISO week
start): the Streak (``domain/streak``) counts consecutive such weeks, and the weekly
Muscle-Group balance (``domain/muscle_groups.weekly_distribution``) composes one bar
per such week. Keeping the boundary in one place means those two can never drift onto
different week edges (issue #178).

Pure and dependency-free: a date in, the Monday of its week out. No ORM, no HTTP."""

from __future__ import annotations

from datetime import date, timedelta


def week_start(day: date) -> date:
    """The Monday of ``day``'s ISO week — the canonical bucket for that week."""

    return day - timedelta(days=day.weekday())


__all__ = ["week_start"]
