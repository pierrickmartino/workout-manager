"""Volume — kg tonnage a user actually moved, converted honestly and disclosed.

``set_volume`` turns one Logged Set's typed Load and its integer reps into the
kilograms it moved: an ``absolute`` load is ``reps × kg``; a ``range`` uses its
midpoint; a ``bodyweight`` set resolves against the user's recorded body weight
(plus any added kg); and a ``percent_1rm`` set against the Exercise's Estimated 1RM
(``domain/one_rep_max.py``). When a conversion's input is missing — no recorded body
weight, no Estimated 1RM yet — the set returns ``None`` rather than a fabricated
figure (ADR-0010) and falls into the uncovered fraction the series discloses.
``qualitative`` and load-less sets never resolve.

Pure and dependency-free over the domain (``load`` only): no ORM, no HTTP."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.load import LoadKind, ParsedLoad


@dataclass(frozen=True)
class VolumeSet:
    """One Logged Set flattened with the date it was performed on.

    The date lives on the Logged Session, not the set, so the read model pairs each
    set with its ``performed_on`` here — giving the series everything it needs to
    bucket by day and slice the trend windows without touching the ORM. ``exercise_id``
    identifies which Exercise the set belongs to, so a ``percent_1rm`` set can be
    converted against that Exercise's Estimated 1RM; it is irrelevant to the other Load
    kinds and defaults to ``0``.
    """

    reps: int
    load: dict | None
    performed_on: date
    exercise_id: int = 0


@dataclass(frozen=True)
class VolumePoint:
    """One day's total convertible volume — a single point on the line chart."""

    performed_on: date
    volume_kg: float


@dataclass(frozen=True)
class VolumeSeries:
    """The volume line for one window: daily points, coverage, and the trend delta.

    ``points`` are the days that had convertible volume, ascending. ``coverage_pct``
    is the share of the window's logged *reps* that actually converted (0–100), so a
    partial total is disclosed rather than presented as authoritative. ``delta_pct``
    is the window's total volume against the immediately preceding equal-length
    window, or ``None`` when there is no prior volume to compare against.
    """

    points: tuple[VolumePoint, ...]
    coverage_pct: float
    delta_pct: float | None


def set_volume(
    load: dict | None,
    reps: int,
    *,
    body_weight_kg: float | None = None,
    estimated_1rm: float | None = None,
) -> float | None:
    """Return the kg volume one Logged Set moved, or ``None`` if not convertible.

    ``absolute`` loads convert to ``reps × kg`` and ``range`` loads to
    ``reps × midpoint(low, high)``. A ``bodyweight`` set converts to
    ``reps × (body_weight_kg + added_kg)`` once ``body_weight_kg`` is supplied, and a
    ``percent_1rm`` set to ``reps × percent/100 × estimated_1rm`` once the Exercise's
    Estimated 1RM is known. Every conversion that lacks its input — a bodyweight set
    with no recorded body weight, a percentage set with no Estimated 1RM, a qualitative
    or load-less set — returns ``None`` and is counted against coverage rather than
    guessed at.
    """

    if load is None:
        return None
    parsed = ParsedLoad.from_dict(load)
    if parsed.kind is LoadKind.ABSOLUTE and parsed.kg is not None:
        return reps * parsed.kg
    if (
        parsed.kind is LoadKind.RANGE
        and parsed.low_kg is not None
        and parsed.high_kg is not None
    ):
        return reps * (parsed.low_kg + parsed.high_kg) / 2
    if parsed.kind is LoadKind.BODYWEIGHT and body_weight_kg is not None:
        return reps * (body_weight_kg + (parsed.added_kg or 0.0))
    if (
        parsed.kind is LoadKind.PERCENT_1RM
        and parsed.percent is not None
        and estimated_1rm is not None
    ):
        return reps * (parsed.percent / 100 * estimated_1rm)
    return None


def volume_series(
    history: Iterable[VolumeSet],
    *,
    days: int,
    today: date,
    body_weight_kg: float | None = None,
    estimated_1rm_by_exercise: dict[int, float] | None = None,
) -> VolumeSeries:
    """Roll a stream of Logged Sets into the volume line for the ``days`` window.

    The window is the ``days`` calendar days ending on ``today`` (inclusive). Only
    convertible sets contribute to the daily points and totals; every logged set —
    convertible or not — counts toward the coverage denominator, so coverage is the
    honest share of the window's reps the chart actually represents. The delta
    compares the window's total against the immediately preceding equal-length
    window, and is ``None`` when that prior window moved no convertible volume.

    ``body_weight_kg`` (the user's recorded mass) resolves ``bodyweight`` sets and
    ``estimated_1rm_by_exercise`` (each Exercise's best Estimated 1RM) resolves
    ``percent_1rm`` sets. Where the input is missing the set stays excluded and still
    counts against coverage, never as zero.
    """

    one_rm = estimated_1rm_by_exercise or {}

    def convert(s: VolumeSet) -> float | None:
        return set_volume(
            s.load,
            s.reps,
            body_weight_kg=body_weight_kg,
            estimated_1rm=one_rm.get(s.exercise_id),
        )

    sets = list(history)
    start = today - timedelta(days=days - 1)
    prior_start = start - timedelta(days=days)
    prior_end = start - timedelta(days=1)

    window = [s for s in sets if start <= s.performed_on <= today]
    prior = [s for s in sets if prior_start <= s.performed_on <= prior_end]

    by_day: dict[date, float] = {}
    for logged_set in window:
        volume = convert(logged_set)
        if volume is None:
            continue
        by_day[logged_set.performed_on] = (
            by_day.get(logged_set.performed_on, 0.0) + volume
        )
    points = tuple(VolumePoint(day, by_day[day]) for day in sorted(by_day))

    total_reps = sum(s.reps for s in window)
    covered_reps = sum(s.reps for s in window if convert(s) is not None)
    coverage_pct = (covered_reps / total_reps * 100) if total_reps else 0.0

    current_volume = sum(by_day.values())
    prior_volume = sum(
        volume for s in prior if (volume := convert(s)) is not None
    )
    delta_pct = (
        (current_volume - prior_volume) / prior_volume * 100 if prior_volume else None
    )

    return VolumeSeries(points=points, coverage_pct=coverage_pct, delta_pct=delta_pct)


__all__ = [
    "VolumeSet",
    "VolumePoint",
    "VolumeSeries",
    "set_volume",
    "volume_series",
]
