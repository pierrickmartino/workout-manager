"""The Training Heatmap — a descriptive daily activity projection (ADR-0054).

``project_heatmap`` turns each Logged Session's performed date and its count of attempted
Logged Sets, plus a reference ``today``, into an immutable **trailing ~53-week grid** of
dated cells: a GitHub-style mosaic where each cell is shaded by how much the user trained
that day. It is a **pure read-time projection** of the record (ADR-0018) — no ORM, no
HTTP, no storage — so a corrected or deleted log simply recomputes it.

Two guardrails are the design (ADR-0054), not incidental:

* **Descriptive only.** The projection emits *only* per-cell facts. It derives **no**
  "current daily run", **no** "longest daily streak", and no daily-consecutiveness figure
  of any kind — the weekly :mod:`app.domain.streak` stays the sole consecutiveness metric,
  so the calendar-free "no today" model (ADR-0001) is never reintroduced as a chain.
* **Fixed thresholds, never per-user relative.** A cell's shade level is a function of
  *that day's set count alone*, bucketed on fixed module constants. A bigger day logged
  later never recolours an earlier day (a settled record is never re-rendered, ADR-0020).

Columns are Monday-aligned through the shared :func:`app.domain.week.week_start`, so the
Heatmap can never drift onto a different week edge than the Streak and Weekly Distance."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.week import week_start

# The window is a rolling, trailing frame of this many Monday-aligned weeks, ending at the
# week of ``today`` — not a fixed Jan–Dec calendar year (ADR-0054). ~53 weeks ≈ a year.
WINDOW_WEEKS = 53

# The number of days per column (a Monday..Sunday week).
_DAYS_PER_WEEK = 7

# The fixed, coarse, tunable shade thresholds: the minimum attempted-set count that lifts a
# day to each non-zero level. Level 0 is neutral (no sets). These are placeholder buckets
# 1–5 / 6–12 / 13–20 / 21+ (ADR-0054) — pure numbers, retunable with no data change, and
# deliberately NOT per-user quantiles, so a past day's cell never recolours (ADR-0020).
SHADE_THRESHOLDS: tuple[int, ...] = (1, 6, 13, 21)


@dataclass(frozen=True)
class ShadeBucket:
    """One rung of the fixed shade scale: the ``level`` and the ``min_sets`` that reach it.

    Emitted alongside the grid so the client renders the legend (less → more) without
    hardcoding the thresholds — they live in one place, here."""

    level: int
    min_sets: int


@dataclass(frozen=True)
class HeatmapCell:
    """One day in the mosaic: its date, grid position, and shaded training texture.

    ``column`` is the 0-based week column from the left (``WINDOW_WEEKS - 1`` is the
    current week); ``row`` is the weekday, 0 = Monday .. 6 = Sunday. ``session_count`` is
    how many Logged Sessions have this performed date (any Completion Outcome, plan-backed
    or plan-less alike); ``set_count`` sums their attempted Logged Sets; ``level`` is the
    fixed-threshold shade (0 neutral, 1..4). A day before the user's first log — or with no
    session — is a neutral, empty cell, read as "nothing logged", never "missed"."""

    date: date
    column: int
    row: int
    session_count: int
    set_count: int
    level: int


@dataclass(frozen=True)
class Heatmap:
    """The projected mosaic: the ordered ``cells`` plus the fixed legend ``scale``.

    Deliberately holds *only* per-cell facts and the shade scale — no daily run, no daily
    streak, no daily-consecutiveness figure (ADR-0054). Cells are ordered ascending by
    date, i.e. column-major (each week top-to-bottom, Monday..Sunday)."""

    cells: tuple[HeatmapCell, ...]
    scale: tuple[ShadeBucket, ...]


def shade_level(set_count: int) -> int:
    """The fixed-threshold shade level (0..4) for a day's attempted-set count.

    Level is the number of :data:`SHADE_THRESHOLDS` the count reaches — a pure function of
    *this day's* record, independent of every other day, so it never recolours (ADR-0054).
    """

    return sum(1 for threshold in SHADE_THRESHOLDS if set_count >= threshold)


def shade_scale() -> tuple[ShadeBucket, ...]:
    """The fixed shade scale: neutral level 0, then one rung per threshold (ascending)."""

    buckets = [ShadeBucket(level=0, min_sets=0)]
    for index, threshold in enumerate(SHADE_THRESHOLDS, start=1):
        buckets.append(ShadeBucket(level=index, min_sets=threshold))
    return tuple(buckets)


def project_heatmap(
    sessions: Iterable[tuple[date, int]], today: date
) -> Heatmap:
    """Project performed ``(date, attempted-set count)`` pairs onto the trailing grid.

    Each pair is one Logged Session: its performed date and how many Logged Sets it holds.
    Sessions on the same day sum their sets and count as multiple sessions; sessions
    outside the trailing window are simply not placed (never an error). An empty history
    yields a full-width, all-neutral frame.
    """

    session_counts: Counter[date] = Counter()
    set_counts: Counter[date] = Counter()
    for performed_on, set_count in sessions:
        session_counts[performed_on] += 1
        set_counts[performed_on] += set_count

    this_monday = week_start(today)
    first_monday = this_monday - timedelta(weeks=WINDOW_WEEKS - 1)

    cells: list[HeatmapCell] = []
    for column in range(WINDOW_WEEKS):
        monday = first_monday + timedelta(weeks=column)
        for row in range(_DAYS_PER_WEEK):
            day = monday + timedelta(days=row)
            set_count = set_counts.get(day, 0)
            cells.append(
                HeatmapCell(
                    date=day,
                    column=column,
                    row=row,
                    session_count=session_counts.get(day, 0),
                    set_count=set_count,
                    level=shade_level(set_count),
                )
            )

    return Heatmap(cells=tuple(cells), scale=shade_scale())


__all__ = [
    "WINDOW_WEEKS",
    "SHADE_THRESHOLDS",
    "ShadeBucket",
    "HeatmapCell",
    "Heatmap",
    "shade_level",
    "shade_scale",
    "project_heatmap",
]
