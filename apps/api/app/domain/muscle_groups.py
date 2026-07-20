"""Muscle Groups — the curated roll-up behind the Analytics muscle distribution.

An Exercise's ``targeted_muscles`` is a free-form string list kept as the durable
analytics-facing union (ADR-0016, amending ADR-0011): the Primary/Secondary emphasis
split lives in separate fields and does not touch this roll-up. This module rolls
those union muscles into six coarse, **curated** Muscle Groups — Legs, Chest, Back,
Shoulders, Arms, Core —
with an explicit **Unclassified** bucket for anything with no known mapping.
Unclassified is shown, never dropped: an unmapped or AI-invented muscle stays
visible rather than silently vanishing.

``distribution`` turns a user's history into ``{group: pct}`` weighted by **set
count**, with each Logged Set split **evenly across the distinct groups** its
Exercise maps to. It is purely set-count based — no Load, no Estimated 1RM — so a
single heavy lift can't dominate the split, and the percentages sum to 100.

Pure and dependency-free (like ``domain/progression.py``): no ORM, no HTTP. The
mapping is curated data, not an AI call per read."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum
from typing import Protocol

from app.domain.week import week_start

_WHITESPACE = re.compile(r"\s+")
_WEEK = timedelta(days=7)

# The shared eight-week span for the Muscle-Group surfaces (issue #187): the recent
# window both the balance-over-time drift chart and the coming Muscle Group Coverage read
# lean on, so they can never disagree on how far back "recent" reaches. Eight weeks is the
# same weekly cadence the Streak counts on (ADR-0024/0025: weekly, not daily) — long enough
# to read drift, short enough to stay legible as stacked bars on a phone.
MUSCLE_BALANCE_WEEKS = 8


class MuscleGroup(str, Enum):
    """A coarse, curated bucket a free-form targeted muscle rolls up into.

    The value is the human-facing label rendered on the Analytics screen. The
    ``str`` base lets a group serialize to its label without extra plumbing.
    """

    LEGS = "Legs"
    CHEST = "Chest"
    BACK = "Back"
    SHOULDERS = "Shoulders"
    ARMS = "Arms"
    CORE = "Core"
    UNCLASSIFIED = "Unclassified"


# Canonical presentation order: the six real groups in a stable body order, with
# Unclassified always last so the "leftovers" bucket reads as a footnote, not a peer.
GROUP_ORDER: tuple[MuscleGroup, ...] = (
    MuscleGroup.LEGS,
    MuscleGroup.CHEST,
    MuscleGroup.BACK,
    MuscleGroup.SHOULDERS,
    MuscleGroup.ARMS,
    MuscleGroup.CORE,
    MuscleGroup.UNCLASSIFIED,
)

# The six **real** Muscle Groups a user actually trains, in canonical body order —
# GROUP_ORDER without the Unclassified leftovers bucket. The fixed roster the Muscle
# Group Coverage read reports on: Unclassified is never a coverage target (ADR-0025).
REAL_GROUPS: tuple[MuscleGroup, ...] = tuple(
    group for group in GROUP_ORDER if group is not MuscleGroup.UNCLASSIFIED
)

# Curated map from a normalized free-form muscle to its Muscle Group. Kept as data
# (not heuristics) so the roll-up is auditable and deterministic. Common synonyms
# and the plural/singular the catalog tends to emit are listed explicitly; anything
# absent falls through to Unclassified rather than being guessed at.
_MUSCLE_TO_GROUP: dict[str, MuscleGroup] = {
    # Legs
    "quadriceps": MuscleGroup.LEGS,
    "quadriceps femoris": MuscleGroup.LEGS,
    "quads": MuscleGroup.LEGS,
    "quad": MuscleGroup.LEGS,
    "hamstrings": MuscleGroup.LEGS,
    "hamstring": MuscleGroup.LEGS,
    "glutes": MuscleGroup.LEGS,
    "glute": MuscleGroup.LEGS,
    "gluteus": MuscleGroup.LEGS,
    "gluteus maximus": MuscleGroup.LEGS,
    "gluteus medius": MuscleGroup.LEGS,
    "calves": MuscleGroup.LEGS,
    "calf": MuscleGroup.LEGS,
    "gastrocnemius": MuscleGroup.LEGS,
    "soleus": MuscleGroup.LEGS,
    "adductors": MuscleGroup.LEGS,
    "adductor": MuscleGroup.LEGS,
    "abductors": MuscleGroup.LEGS,
    "abductor": MuscleGroup.LEGS,
    "hip flexors": MuscleGroup.LEGS,
    "hip flexor": MuscleGroup.LEGS,
    # Chest
    "chest": MuscleGroup.CHEST,
    "pectorals": MuscleGroup.CHEST,
    "pectoral": MuscleGroup.CHEST,
    "pecs": MuscleGroup.CHEST,
    "pectoralis": MuscleGroup.CHEST,
    "pectoralis major": MuscleGroup.CHEST,
    "pectoralis minor": MuscleGroup.CHEST,
    # Back
    "back": MuscleGroup.BACK,
    "upper back": MuscleGroup.BACK,
    "lower back": MuscleGroup.BACK,
    "lats": MuscleGroup.BACK,
    "lat": MuscleGroup.BACK,
    "latissimus dorsi": MuscleGroup.BACK,
    "trapezius": MuscleGroup.BACK,
    "traps": MuscleGroup.BACK,
    "trap": MuscleGroup.BACK,
    "rhomboids": MuscleGroup.BACK,
    "rhomboid": MuscleGroup.BACK,
    "erector spinae": MuscleGroup.BACK,
    "teres major": MuscleGroup.BACK,
    "teres minor": MuscleGroup.BACK,
    # Shoulders
    "shoulders": MuscleGroup.SHOULDERS,
    "shoulder": MuscleGroup.SHOULDERS,
    "deltoids": MuscleGroup.SHOULDERS,
    "deltoid": MuscleGroup.SHOULDERS,
    "delts": MuscleGroup.SHOULDERS,
    "delt": MuscleGroup.SHOULDERS,
    "front delts": MuscleGroup.SHOULDERS,
    "rear delts": MuscleGroup.SHOULDERS,
    "rotator cuff": MuscleGroup.SHOULDERS,
    # Arms
    "biceps": MuscleGroup.ARMS,
    "bicep": MuscleGroup.ARMS,
    "biceps brachii": MuscleGroup.ARMS,
    "triceps": MuscleGroup.ARMS,
    "tricep": MuscleGroup.ARMS,
    "triceps brachii": MuscleGroup.ARMS,
    "forearms": MuscleGroup.ARMS,
    "forearm": MuscleGroup.ARMS,
    "brachialis": MuscleGroup.ARMS,
    # Core
    "core": MuscleGroup.CORE,
    "abs": MuscleGroup.CORE,
    "ab": MuscleGroup.CORE,
    "abdominals": MuscleGroup.CORE,
    "rectus abdominis": MuscleGroup.CORE,
    "obliques": MuscleGroup.CORE,
    "oblique": MuscleGroup.CORE,
    "transverse abdominis": MuscleGroup.CORE,
}


class _LoggedSet(Protocol):
    targeted_muscles: Sequence[str]


class _LoggedSession(Protocol):
    logged_sets: Sequence[_LoggedSet]


class _DatedLoggedSession(_LoggedSession, Protocol):
    """A Logged Session that also carries the date it was performed, so the weekly
    series can bucket it by its Monday."""

    performed_on: date


def _normalize(muscle: str) -> str:
    """Canonical lookup key: lowercased, trimmed, internal whitespace collapsed."""

    return _WHITESPACE.sub(" ", muscle.strip()).lower()


def classify(muscle: str) -> MuscleGroup:
    """Roll a single free-form muscle up into its curated Muscle Group.

    Matching is case- and whitespace-insensitive. A muscle with no curated entry
    (unknown or AI-invented) returns ``UNCLASSIFIED`` — never dropped, never
    guessed at.
    """

    return _MUSCLE_TO_GROUP.get(_normalize(muscle), MuscleGroup.UNCLASSIFIED)


def covered_groups(history: Iterable[_LoggedSession]) -> set[MuscleGroup]:
    """Return the set of the six **real** Muscle Groups the history has trained.

    A group is *covered* iff some Logged Set's Exercise rolls a muscle into it via
    :func:`classify`; the Unclassified bucket is never one of the six and never counts.
    The single shared definition of "covered" (issue #187) behind both the Muscle Group
    Coverage read and the Full Coverage Achievement, so the two can never disagree. An
    empty history — or one that trained only unmapped muscles — yields the empty set.
    """

    return {
        group
        for session in history
        for logged_set in session.logged_sets
        for muscle in logged_set.targeted_muscles
        if (group := classify(muscle)) is not MuscleGroup.UNCLASSIFIED
    }


def _groups_for_set(logged_set: _LoggedSet) -> set[MuscleGroup]:
    """The distinct Muscle Groups one Logged Set's Exercise trains.

    An Exercise with no ``targeted_muscles`` recorded maps to nothing known, so it
    counts as a single Unclassified group — shown, never dropped.
    """

    groups = {classify(muscle) for muscle in logged_set.targeted_muscles}
    return groups or {MuscleGroup.UNCLASSIFIED}


def _weigh(history: Iterable[_LoggedSession]) -> tuple[dict[MuscleGroup, float], float]:
    """Accumulate the even-split, set-count group weights over ``history``.

    Every Logged Set carries one unit of weight, split **evenly across the distinct
    groups** its Exercise maps to (a set that trains two groups gives each a half).
    Returns the raw per-group weights and the total set count, before normalization —
    the shared kernel behind both the snapshot ``distribution`` and each week of
    ``weekly_distribution`` so the two can never weigh a set differently.
    """

    weights: dict[MuscleGroup, float] = {}
    total = 0.0
    for session in history:
        for logged_set in session.logged_sets:
            groups = _groups_for_set(logged_set)
            share = 1.0 / len(groups)
            for group in groups:
                weights[group] = weights.get(group, 0.0) + share
            total += 1.0
    return weights, total


def _as_percentages(
    weights: dict[MuscleGroup, float], total: float
) -> dict[MuscleGroup, float]:
    """Normalize raw group weights to percentages that sum to 100, in ``GROUP_ORDER``.

    Only groups that received weight appear, ordered canonically (Unclassified last).
    A total of zero — no sets weighed — yields ``{}``, the honest empty state.
    """

    if total == 0.0:
        return {}
    return {
        group: weights[group] / total * 100.0
        for group in GROUP_ORDER
        if group in weights
    }


def distribution(history: Iterable[_LoggedSession]) -> dict[MuscleGroup, float]:
    """Return the set-count muscle distribution as ``{group: pct}``.

    Every Logged Set carries one unit of weight, split **evenly across the distinct
    groups** its Exercise maps to (a set that trains two groups gives each a half).
    Weight is summed across the whole history and normalized to percentages that
    sum to 100. The result holds only the groups that received weight, in canonical
    ``GROUP_ORDER``; a history with no sets yields an empty distribution — the
    honest empty state, never an error.
    """

    return _as_percentages(*_weigh(history))


@dataclass(frozen=True)
class WeeklyComposition:
    """One week's set-count muscle composition in the balance-over-time series.

    ``week_start`` is the Monday the week is bucketed on; ``composition`` is that
    week's ``{group: pct}`` under the same even-split rule as the snapshot, normalized
    to 100 over the groups trained that week — or an empty dict for a week with no
    training, kept in the series as an honest empty week rather than dropped.
    """

    week_start: date
    composition: dict[MuscleGroup, float]


def weekly_distribution(
    history: Iterable[_DatedLoggedSession],
    *,
    reference: date,
    weeks: int,
) -> list[WeeklyComposition]:
    """Return the muscle composition per week, oldest-first, over the last ``weeks``.

    The series spans the ``weeks`` consecutive weeks ending at ``reference``'s week,
    each bucketed by its Monday and composed with the identical even-split, set-count
    rule as :func:`distribution`, normalized to 100 **within that week**. Every week in
    the window appears — a week with no training is an honest empty composition (``{}``),
    never silently dropped — so the series always has exactly ``weeks`` elements (or none
    when ``weeks`` is not positive). Sessions outside the window are ignored.
    """

    if weeks <= 0:
        return []

    buckets: dict[date, list[_DatedLoggedSession]] = {}
    for session in history:
        buckets.setdefault(week_start(session.performed_on), []).append(session)

    this_week = week_start(reference)
    series: list[WeeklyComposition] = []
    for offset in range(weeks - 1, -1, -1):
        monday = this_week - offset * _WEEK
        series.append(
            WeeklyComposition(monday, _as_percentages(*_weigh(buckets.get(monday, []))))
        )
    return series


@dataclass(frozen=True)
class GroupCoverage:
    """One real Muscle Group's presence over the recent coverage window.

    ``covered`` is ``True`` iff the group was trained at least once inside the window —
    presence, not a threshold or a proportion. Frozen and value-typed, mirroring
    :class:`WeeklyComposition`'s discipline, so the coverage read stays immutable and the
    six rows carry the group alongside its state rather than a bare bool the caller must
    re-pair with a label.
    """

    group: MuscleGroup
    covered: bool


@dataclass(frozen=True)
class RecentCoverage:
    """The neutral Muscle Group Coverage read over the recent window (ADR-0025).

    ``groups`` is the six real Muscle Groups in canonical order, each trained / not-trained;
    ``unclassified_present`` is ``True`` iff some in-window Logged Set lists a muscle that
    rolls up to Unclassified (unmapped, AI-invented, or an Exercise with no muscles recorded),
    the signal behind the neutral disclosure footnote (issue #189). Unclassified is disclosed,
    never dropped — but it is never one of the six and never a coverage target, so the flag
    leaves every real-group state untouched. Frozen and value-typed, mirroring
    :class:`WeeklyComposition`'s discipline, so the whole read stays immutable.
    """

    groups: tuple[GroupCoverage, ...]
    unclassified_present: bool


def _has_unclassified(history: Iterable[_LoggedSession]) -> bool:
    """Whether any Logged Set in ``history`` rolls up to the Unclassified bucket.

    Reuses :func:`_groups_for_set` so the "counts as Unclassified" rule is identical to the
    one the distribution weighs by: a set lists an unmapped muscle, or records no muscles at
    all. A set that trains a real group *and* an unmapped muscle still counts — the unmapped
    work is real work sitting outside the six, which is exactly what the footnote discloses.
    """

    return any(
        MuscleGroup.UNCLASSIFIED in _groups_for_set(logged_set)
        for session in history
        for logged_set in session.logged_sets
    )


def recent_coverage(
    history: Iterable[_DatedLoggedSession],
    *,
    reference: date,
    weeks: int,
) -> RecentCoverage:
    """Report each of the six real Muscle Groups trained / not-trained over the window.

    The window is the ``weeks`` consecutive weeks ending at ``reference``'s week, bucketed
    by Monday exactly as :func:`weekly_distribution` — so an absent group is precisely one
    with no segment in any of the drift chart's bars (ADR-0025). A group counts as *covered*
    when at least one in-window Logged Set rolls a muscle into it via :func:`covered_groups`;
    presence, never a threshold. Every one of :data:`REAL_GROUPS` is returned in canonical
    order (Unclassified is never a coverage target); a group trained only outside the window
    reads not-trained, and an empty or wholly out-of-window history reads six not-trained
    rows — the caller decides how to present that honest "nothing recent" state.

    Alongside the six, :attr:`RecentCoverage.unclassified_present` discloses whether any
    in-window set rolls up to Unclassified, so the "of 6" figure stays honest about work
    that falls outside the real groups (issue #189) without ever listing Unclassified as a
    seventh row or a coverage target.
    """

    this_week = week_start(reference)
    earliest = this_week - (weeks - 1) * _WEEK if weeks > 0 else this_week + _WEEK
    in_window = [
        session
        for session in history
        if earliest <= week_start(session.performed_on) <= this_week
    ]
    covered = covered_groups(in_window)
    return RecentCoverage(
        groups=tuple(
            GroupCoverage(group=group, covered=group in covered)
            for group in REAL_GROUPS
        ),
        unclassified_present=_has_unclassified(in_window),
    )


__all__ = [
    "MuscleGroup",
    "GROUP_ORDER",
    "REAL_GROUPS",
    "MUSCLE_BALANCE_WEEKS",
    "WeeklyComposition",
    "GroupCoverage",
    "RecentCoverage",
    "classify",
    "covered_groups",
    "distribution",
    "recent_coverage",
    "weekly_distribution",
]
