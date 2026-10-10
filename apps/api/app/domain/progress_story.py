"""Progress Story — what changed on an Exercise since last time (ADR-0127).

``progress_story`` compares the user's **latest** Logged Session of an Exercise with the
**most recent earlier comparable** one and returns a structured :class:`ProgressStory` —
never a sentence; the web view-model owns the copy. The comparison is *exact* or it is
nothing: one quantity is held equal and the other is measured, using only what was
logged. It never falls back to an Estimated 1RM, and it never mixes Load kinds.

This slice compares ``absolute`` Loads in non-warm-up rep sets, by two rules in order:

1. **Shared load** — the heaviest load present in both sessions; compare the best reps
   each did at it (axis ``reps_at_load``). Loads match at logged precision
   (:data:`LOAD_PRECISION_DECIMALS`).
2. **Shared rep count** — otherwise, the heaviest rep count present in both; compare the
   heaviest load each lifted for it (axis ``load_at_reps``).

Earlier sessions are scanned backwards until one matches by either rule. Anything else —
a single session, no earlier match, or only ineligible sets (%1RM, qualitative, range,
bodyweight, or a timed or distance amount) — is ``insufficient``.

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
    """How the latest performance compares with the earlier comparable one."""

    IMPROVED = "improved"
    UNCHANGED = "unchanged"
    DECLINED = "declined"
    INSUFFICIENT = "insufficient"


class StoryAxis(str, Enum):
    """Which quantity is held equal and which is measured.

    ``reps_at_load`` holds a load (kg) and measures reps; ``load_at_reps`` holds a rep
    count and measures the load (kg).
    """

    REPS_AT_LOAD = "reps_at_load"
    LOAD_AT_REPS = "load_at_reps"


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

    ``held`` is the value both sides share — the load in kg for ``reps_at_load``, the rep
    count for ``load_at_reps``; ``latest.value`` and ``previous.value`` are the measured
    values (reps, or kg) and ``delta`` is their signed difference, latest minus previous.
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
    """Compare the latest Logged Session of ``exercise_id`` with the most recent earlier
    one that is comparable with it.

    A session performs the Exercise when it holds a non-warm-up set of it; sessions are
    ordered newest-first by date, then id, whatever order ``history`` arrives in. Earlier
    sessions are scanned backwards until one matches by either rule.
    """

    performances = sorted(
        (
            _performance_of(session, sets)
            for session in history
            if (sets := _working_sets(session, exercise_id))
        ),
        key=lambda performance: (performance.performed_on, performance.logged_session_id),
        reverse=True,
    )
    if not performances:
        return INSUFFICIENT
    latest, earlier = performances[0], performances[1:]
    for previous in earlier:
        story = _at_shared_load(latest, previous) or _at_shared_reps(latest, previous)
        if story is not None:
            return story
    return INSUFFICIENT


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


@dataclass(frozen=True)
class _Performance:
    """One session's eligible sets of the Exercise, as ``(kilograms, reps)`` pairs."""

    logged_session_id: int
    performed_on: date
    sets: tuple[tuple[float, int], ...]

    def side(self, value: float) -> StorySide:
        return StorySide(self.logged_session_id, self.performed_on, value)


def _performance_of(session: StorySession, sets: Iterable[StorySet]) -> _Performance:
    """Keep the eligible sets: an absolute Load lifted for a count of reps."""

    eligible = []
    for logged_set in sets:
        reps = repetitions_of(logged_set.quantity)
        if reps is None or logged_set.load is None:
            continue
        load = ParsedLoad.from_dict(logged_set.load)
        if load.kind is LoadKind.ABSOLUTE and load.kg is not None:
            eligible.append((load.kg, reps))
    return _Performance(session.id, session.performed_on, tuple(eligible))


def _at_shared_load(latest: _Performance, previous: _Performance) -> ProgressStory | None:
    """Rule 1: hold the heaviest shared load, measure the best reps at it."""

    latest_reps = _best_reps_by_load(latest)
    previous_reps = _best_reps_by_load(previous)
    shared = latest_reps.keys() & previous_reps.keys()
    if not shared:
        return None
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
        latest=latest.side(latest_best),
        previous=previous.side(previous_best),
    )


def _at_shared_reps(latest: _Performance, previous: _Performance) -> ProgressStory | None:
    """Rule 2: hold the heaviest shared rep count, measure the heaviest load at it.

    Reached only when no load is shared, so the two heaviest loads always differ at
    logged precision: this rule states an improvement or a decline, never "the same".
    """

    latest_loads = _heaviest_load_by_reps(latest)
    previous_loads = _heaviest_load_by_reps(previous)
    shared = latest_loads.keys() & previous_loads.keys()
    if not shared:
        return None
    reps = max(shared)
    latest_kg, previous_kg = latest_loads[reps], previous_loads[reps]
    return ProgressStory(
        kind=_kind_of(_load_key(latest_kg) - _load_key(previous_kg)),
        axis=StoryAxis.LOAD_AT_REPS,
        load_kind=LoadKind.ABSOLUTE,
        held=reps,
        delta=latest_kg - previous_kg,
        latest=latest.side(latest_kg),
        previous=previous.side(previous_kg),
    )


def _best_reps_by_load(performance: _Performance) -> dict[float, tuple[float, int]]:
    """The best reps per load, keyed by the load at logged precision.

    Each value keeps the logged kilograms beside the best reps, so the story reports the
    load as it was logged, not the rounded key.
    """

    best: dict[float, tuple[float, int]] = {}
    for kg, reps in performance.sets:
        key = _load_key(kg)
        current = best.get(key)
        if current is None or reps > current[1]:
            best[key] = (kg, reps)
    return best


def _heaviest_load_by_reps(performance: _Performance) -> dict[int, float]:
    """The heaviest logged kilograms per rep count."""

    heaviest: dict[int, float] = {}
    for kg, reps in performance.sets:
        if reps not in heaviest or kg > heaviest[reps]:
            heaviest[reps] = kg
    return heaviest


def _load_key(kg: float) -> float:
    return round(kg, LOAD_PRECISION_DECIMALS)


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
