"""Progress Story — what changed on an Exercise since last time (ADR-0127).

``progress_story`` compares the user's **latest** Logged Session of an Exercise with the
**immediately previous** one and returns a structured :class:`ProgressStory` — never a
sentence; the web view-model owns the copy. The comparison is *exact* or it is nothing:
one quantity is held equal and the other is measured, using only what was logged. It
never falls back to an Estimated 1RM, and it never mixes Load kinds.

This slice compares ``absolute`` Loads on the **heaviest shared load** rule: take the
heaviest load present in both sessions' non-warm-up rep sets, and compare the best reps
each session did at it. Loads match at logged precision (:data:`LOAD_PRECISION_DECIMALS`).
Anything else — a single session, no shared load, or only ineligible sets (%1RM,
qualitative, range, bodyweight, or a timed or distance amount) — is ``insufficient``.

A read-time projection like every other progress figure: nothing is stored, so editing or
deleting a Logged Session changes the story on the next read. Pure and dependency-free
over the domain (``load`` + ``quantity`` + ``set_type``): no ORM, no HTTP."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Protocol

from app.domain.load import LoadKind, ParsedLoad
from app.domain.quantity import repetitions_of
from app.domain.set_type import is_warm_up

# Loads are compared at the precision a user can log — grams. Stored kilograms are exact,
# so a pound entry carries the conversion's floating-point residue (60 lb is
# 27.2155422 kg); rounding to grams lets two entries of one logged load match without
# ever merging two loads a user could tell apart (60 and 60.25 kg stay distinct).
LOAD_PRECISION_DECIMALS = 3


class StoryKind(str, Enum):
    """How the latest performance compares with the previous one."""

    IMPROVED = "improved"
    UNCHANGED = "unchanged"
    DECLINED = "declined"
    INSUFFICIENT = "insufficient"


class StoryAxis(str, Enum):
    """Which quantity is held equal and which is measured."""

    REPS_AT_LOAD = "reps_at_load"


class StorySet(Protocol):
    """The Logged Set fields the story reads (satisfied by ``LoggedSetView``)."""

    exercise_id: int
    quantity: dict | None
    load: dict | None
    set_type: str | None


class StorySession(Protocol):
    """The Logged Session fields the story reads (satisfied by ``LoggedSessionView``)."""

    id: int
    performed_on: date
    logged_sets: Sequence[StorySet]


@dataclass(frozen=True)
class StorySide:
    """One side of the comparison: its Logged Session and the value it measured."""

    logged_session_id: int
    performed_on: date
    value: float


@dataclass(frozen=True)
class ProgressStory:
    """The structured comparison. Every field but ``kind`` is ``None`` when insufficient.

    ``held`` is the value both sides share (the load, in kg, for ``reps_at_load``);
    ``latest.value`` and ``previous.value`` are the measured values and ``delta`` is
    their signed difference, latest minus previous.
    """

    kind: StoryKind
    axis: StoryAxis | None = None
    load_kind: LoadKind | None = None
    held: float | None = None
    delta: float | None = None
    latest: StorySide | None = None
    previous: StorySide | None = None


INSUFFICIENT = ProgressStory(kind=StoryKind.INSUFFICIENT)


def progress_story(history: Iterable[StorySession], exercise_id: int) -> ProgressStory:
    """Compare the latest Logged Session of ``exercise_id`` with the one before it.

    A session performs the Exercise when it holds a non-warm-up set of it; sessions are
    ordered newest-first by date, then id, whatever order ``history`` arrives in.
    """

    performances = sorted(
        (session for session in history if _working_sets(session, exercise_id)),
        key=lambda session: (session.performed_on, session.id),
        reverse=True,
    )
    if len(performances) < 2:
        return INSUFFICIENT
    latest, previous = performances[0], performances[1]
    latest_reps = _best_reps_by_load(_working_sets(latest, exercise_id))
    previous_reps = _best_reps_by_load(_working_sets(previous, exercise_id))
    shared = latest_reps.keys() & previous_reps.keys()
    if not shared:
        return INSUFFICIENT
    key = max(shared)
    held_kg, latest_best = latest_reps[key]
    _, previous_best = previous_reps[key]
    delta = latest_best - previous_best
    return ProgressStory(
        kind=_kind_of(delta),
        axis=StoryAxis.REPS_AT_LOAD,
        load_kind=LoadKind.ABSOLUTE,
        held=held_kg,
        delta=delta,
        latest=StorySide(latest.id, latest.performed_on, latest_best),
        previous=StorySide(previous.id, previous.performed_on, previous_best),
    )


def progress_story_payload(story: ProgressStory) -> dict:
    """The JSON shape of a story — identical wherever a response carries one."""

    return {
        "kind": story.kind.value,
        "axis": story.axis.value if story.axis else None,
        "load_kind": story.load_kind.value if story.load_kind else None,
        "held": story.held,
        "delta": story.delta,
        "latest": _side_payload(story.latest),
        "previous": _side_payload(story.previous),
    }


def _side_payload(side: StorySide | None) -> dict | None:
    if side is None:
        return None
    return {
        "logged_session_id": side.logged_session_id,
        "performed_on": side.performed_on.isoformat(),
        "value": side.value,
    }


def _working_sets(session: StorySession, exercise_id: int) -> list[StorySet]:
    return [
        logged_set
        for logged_set in session.logged_sets
        if logged_set.exercise_id == exercise_id and not is_warm_up(logged_set.set_type)
    ]


def _best_reps_by_load(sets: Iterable[StorySet]) -> dict[float, tuple[float, int]]:
    """The best reps per absolute load among eligible sets.

    Keyed by the load at logged precision; each value keeps the logged kilograms beside
    the best reps, so the story reports the load as it was logged, not the rounded key.
    """

    best: dict[float, tuple[float, int]] = {}
    for logged_set in sets:
        reps = repetitions_of(logged_set.quantity)
        if reps is None or logged_set.load is None:
            continue
        load = ParsedLoad.from_dict(logged_set.load)
        if load.kind is not LoadKind.ABSOLUTE or load.kg is None:
            continue
        key = round(load.kg, LOAD_PRECISION_DECIMALS)
        current = best.get(key)
        if current is None or reps > current[1]:
            best[key] = (load.kg, reps)
    return best


def _kind_of(delta: float) -> StoryKind:
    if delta > 0:
        return StoryKind.IMPROVED
    if delta < 0:
        return StoryKind.DECLINED
    return StoryKind.UNCHANGED


__all__ = [
    "INSUFFICIENT",
    "LOAD_PRECISION_DECIMALS",
    "ProgressStory",
    "StoryAxis",
    "StoryKind",
    "StorySide",
    "progress_story",
    "progress_story_payload",
]
