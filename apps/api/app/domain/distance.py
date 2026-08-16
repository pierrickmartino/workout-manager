"""Weekly Distance — the kilometres a user actually covered, projected read-time.

The endurance twin of ``domain/volume.py`` (ADR-0049). Where volume sums convertible
kg tonnage, this sums the metres of every ``distance``-kind Quantity a user logged and
buckets them **by week** — the shared Monday week-start (``domain/week.py``) the Streak
and Muscle-Group balance already use — into one bar per week, reported in kilometres.

Two things make it a deliberately *smaller* read model than volume:

- **No coverage figure.** A ``distance`` Quantity carries exact metres (ADR-0032), so
  every distance set contributes fully; nothing sits in an uncovered remainder the way
  bodyweight and %-1RM sets do for tonnage. The series discloses only its trend delta.
- **No per-activity split.** v1 sums *all* distance work into one combined total; a
  running/cycling/rowing breakdown would need an activity taxonomy the domain does not
  yet have (ADR-0049).

The amount axis is read through ``quantity.metres_of``: a set whose amount is a rep
count or a timeless duration has ``None`` metres and simply falls out — no "is this a
run?" branch. Pure and dependency-free over the domain (``quantity`` + ``week``): no
ORM, no HTTP."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.quantity import metres_of
from app.domain.week import week_start

_METRES_PER_KM = 1000.0


@dataclass(frozen=True)
class DistanceSet:
    """One Logged Set flattened with the date it was performed on.

    Only the typed ``quantity`` and the session's ``performed_on`` are needed: distance
    converts without body weight or an Estimated 1RM, so — unlike ``VolumeSet`` — there
    is no load or ``exercise_id`` to carry. A non-``distance`` amount yields ``None``
    metres and contributes nothing.
    """

    quantity: dict | None
    performed_on: date


@dataclass(frozen=True)
class DistanceWeek:
    """One week's total distance — a single bar on the Weekly Distance chart.

    ``week_start`` is the Monday the week is bucketed by; ``kilometres`` is the summed
    distance of every ``distance`` set performed that week, in kilometres.
    """

    week_start: date
    kilometres: float


@dataclass(frozen=True)
class DistanceSeries:
    """The weekly-distance bars for one window plus the trend delta.

    ``weeks`` are the weeks that had distance work, ascending by their Monday.
    ``delta_pct`` is the window's total distance against the immediately preceding
    equal-length window, or ``None`` when there is no prior distance to compare against.
    There is deliberately no coverage figure — distance never partially converts.
    """

    weeks: tuple[DistanceWeek, ...]
    delta_pct: float | None


def has_distance(history: Iterable[DistanceSet]) -> bool:
    """Whether any set in ``history`` carries a distance — the all-time gate.

    The Analytics screen shows the Weekly Distance chart only to a user who has ever
    logged distance work, mirroring how Strength Analytics gates on qualifying strength
    history. A runner who did not run inside the selected window still reads ``True``.
    """

    return any(metres_of(s.quantity) is not None for s in history)


def distance_series(
    history: Iterable[DistanceSet],
    *,
    days: int,
    today: date,
) -> DistanceSeries:
    """Roll a stream of Logged Sets into the weekly-distance bars for the window.

    The window is the ``days`` calendar days ending on ``today`` (inclusive). Only
    ``distance`` sets contribute; their metres are bucketed by Monday week-start and
    summed into kilometres, one bar per week ascending. The delta compares the window's
    total distance against the immediately preceding equal-length window, and is
    ``None`` when that prior window covered no distance.
    """

    sets = list(history)
    start = today - timedelta(days=days - 1)
    prior_start = start - timedelta(days=days)
    prior_end = start - timedelta(days=1)

    by_week: dict[date, float] = {}
    window_metres = 0.0
    for logged_set in sets:
        if not (start <= logged_set.performed_on <= today):
            continue
        metres = metres_of(logged_set.quantity)
        if metres is None:
            continue
        window_metres += metres
        bucket = week_start(logged_set.performed_on)
        by_week[bucket] = by_week.get(bucket, 0.0) + metres

    weeks = tuple(
        DistanceWeek(week, by_week[week] / _METRES_PER_KM) for week in sorted(by_week)
    )

    prior_metres = sum(
        metres
        for s in sets
        if prior_start <= s.performed_on <= prior_end
        and (metres := metres_of(s.quantity)) is not None
    )
    delta_pct = (
        (window_metres - prior_metres) / prior_metres * 100 if prior_metres else None
    )

    return DistanceSeries(weeks=weeks, delta_pct=delta_pct)


__all__ = [
    "DistanceSet",
    "DistanceWeek",
    "DistanceSeries",
    "has_distance",
    "distance_series",
]
