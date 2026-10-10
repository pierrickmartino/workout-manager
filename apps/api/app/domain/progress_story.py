"""Progress Story — what changed on an Exercise since last time (ADR-0127).

``progress_story`` compares the user's **latest** Logged Session of an Exercise with the
**most recent earlier comparable** one and returns a structured :class:`ProgressStory` —
never a sentence; the web view-model owns the copy. The comparison is *exact* or it is
nothing: one quantity is held equal and the other is measured, using only what was
logged. It never falls back to an Estimated 1RM, and it never mixes Load kinds.

It compares ``absolute`` and ``bodyweight`` Loads in non-warm-up rep sets — never one
against the other — by two rules in order:

1. **Shared load** — the heaviest load present in both sessions; compare the best reps
   each did at it (axis ``reps_at_load``). Loads match at logged precision
   (:data:`LOAD_PRECISION_DECIMALS`).
2. **Shared rep count** — otherwise, the heaviest rep count present in both; compare the
   heaviest load each lifted for it (axis ``load_at_reps``).

A bodyweight set's load is its **added** load, zero when none (ADR-0026); its Performed
Body Weight is never compared, only carried for a footnote when the two sides differ.
Within a pair each rule is tried in ``absolute`` then ``bodyweight``.

Earlier sessions are scanned backwards until one matches by either rule. Anything else —
a single session, no earlier match, or only ineligible sets (%1RM, qualitative, range, or
a timed or distance amount) — is ``insufficient``.

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
    body_weight_kg: float | None


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
class BodyWeightChange:
    """The Performed Body Weights (kg) behind a bodyweight story, when they differ."""

    previous_kg: float
    latest_kg: float


@dataclass(frozen=True)
class ProgressStory:
    """The structured comparison. Every field but ``kind`` is ``None`` when insufficient.

    ``held`` is the value both sides share — the load in kg for ``reps_at_load``, the rep
    count for ``load_at_reps``; ``latest.value`` and ``previous.value`` are the measured
    values (reps, or kg) and ``delta`` is their signed difference, latest minus previous.
    For ``bodyweight`` the load is the *added* load; ``body_weight`` carries the two
    compared sets' Performed Body Weights when both were recorded and they differ, for
    the footnote — never part of the comparison itself.
    """

    kind: StoryKind
    axis: StoryAxis | None = None
    load_kind: LoadKind | None = None
    held: float | None = None
    delta: float | None = None
    latest: StorySide | None = None
    previous: StorySide | None = None
    body_weight: BodyWeightChange | None = None


INSUFFICIENT = ProgressStory(kind=StoryKind.INSUFFICIENT)


def progress_story(history: Iterable[StorySession], exercise_id: int) -> ProgressStory:
    """Compare the latest Logged Session of ``exercise_id`` with the most recent earlier
    one that is comparable with it.

    A session performs the Exercise when it holds a non-warm-up set of it; sessions are
    ordered newest-first by date, then id, whatever order ``history`` arrives in. Earlier
    sessions are scanned backwards until one matches by either rule.
    """

    sessions = sorted(
        (
            _eligible_sets_of(session, sets)
            for session in history
            if (sets := _working_sets(session, exercise_id))
        ),
        key=lambda eligible: (eligible.performed_on, eligible.logged_session_id),
        reverse=True,
    )
    if not sessions:
        return INSUFFICIENT
    latest, earlier = sessions[0], sessions[1:]
    for previous in earlier:
        story = _compare(latest, previous)
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
        "body_weight": _body_weight_payload(story.body_weight),
    }


def _body_weight_payload(change: BodyWeightChange | None) -> dict | None:
    if change is None:
        return None
    return {"previous_kg": change.previous_kg, "latest_kg": change.latest_kg}


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


# The Load kinds a story compares, in the order a pair is tried: never one against the other.
_COMPARABLE_KINDS = (LoadKind.ABSOLUTE, LoadKind.BODYWEIGHT)


@dataclass(frozen=True)
class _Lift:
    """One eligible set: the load in kg (the *added* load for bodyweight), its reps, and
    the Performed Body Weight it was logged at, if any."""

    kg: float
    reps: int
    body_weight_kg: float | None = None


@dataclass(frozen=True)
class _EligibleSets:
    """One session's eligible sets of the Exercise, each tagged with its Load kind."""

    logged_session_id: int
    performed_on: date
    lifts: tuple[tuple[LoadKind, _Lift], ...]

    def of(self, kind: LoadKind) -> list[_Lift]:
        return [lift for lift_kind, lift in self.lifts if lift_kind is kind]

    def side(self, value: float) -> StorySide:
        return StorySide(self.logged_session_id, self.performed_on, value)


def _eligible_sets_of(session: StorySession, sets: Iterable[StorySet]) -> _EligibleSets:
    """Keep the eligible sets: an absolute or bodyweight Load lifted for at least one rep.

    A bodyweight set's load is its added load — zero when none (ADR-0026). A zero-rep set
    (a failed attempt) lifted nothing, so it is no load "for N reps".
    """

    eligible = []
    for logged_set in sets:
        reps = repetitions_of(logged_set.quantity)
        if reps is None or reps < 1 or logged_set.load is None:
            continue
        load = ParsedLoad.from_dict(logged_set.load)
        kg = _comparable_kg(load)
        if kg is not None:
            eligible.append((load.kind, _Lift(kg, reps, logged_set.body_weight_kg)))
    return _EligibleSets(session.id, session.performed_on, tuple(eligible))


def _comparable_kg(load: ParsedLoad) -> float | None:
    if load.kind is LoadKind.ABSOLUTE:
        return load.kg
    if load.kind is LoadKind.BODYWEIGHT:
        return load.added_kg or 0.0
    return None


def _compare(latest: _EligibleSets, previous: _EligibleSets) -> ProgressStory | None:
    """The shared-load rule in each Load kind, then the shared-rep rule in each."""

    for rule in (_at_shared_load, _at_shared_reps):
        for kind in _COMPARABLE_KINDS:
            story = rule(latest, previous, kind)
            if story is not None:
                return story
    return None


def _at_shared_load(
    latest: _EligibleSets, previous: _EligibleSets, kind: LoadKind
) -> ProgressStory | None:
    """Rule 1: hold the heaviest shared load, measure the best reps at it."""

    latest_best = _best_reps_by_load(latest.of(kind))
    previous_best = _best_reps_by_load(previous.of(kind))
    shared = latest_best.keys() & previous_best.keys()
    if not shared:
        return None
    key = max(shared)
    latest_lift, previous_lift = latest_best[key], previous_best[key]
    delta = latest_lift.reps - previous_lift.reps
    return ProgressStory(
        kind=_kind_of(delta),
        axis=StoryAxis.REPS_AT_LOAD,
        load_kind=kind,
        held=latest_lift.kg,
        delta=delta,
        latest=latest.side(latest_lift.reps),
        previous=previous.side(previous_lift.reps),
        body_weight=_body_weight_change(kind, latest_lift, previous_lift),
    )


def _at_shared_reps(
    latest: _EligibleSets, previous: _EligibleSets, kind: LoadKind
) -> ProgressStory | None:
    """Rule 2: hold the heaviest shared rep count, measure the heaviest load at it.

    Reached only when no load of this kind is shared, so the two heaviest loads always
    differ at logged precision: this rule states an improvement or a decline, never "the
    same".
    """

    latest_heaviest = _heaviest_load_by_reps(latest.of(kind))
    previous_heaviest = _heaviest_load_by_reps(previous.of(kind))
    shared = latest_heaviest.keys() & previous_heaviest.keys()
    if not shared:
        return None
    reps = max(shared)
    latest_lift, previous_lift = latest_heaviest[reps], previous_heaviest[reps]
    return ProgressStory(
        kind=_kind_of(_load_key(latest_lift.kg) - _load_key(previous_lift.kg)),
        axis=StoryAxis.LOAD_AT_REPS,
        load_kind=kind,
        held=reps,
        delta=latest_lift.kg - previous_lift.kg,
        latest=latest.side(latest_lift.kg),
        previous=previous.side(previous_lift.kg),
        body_weight=_body_weight_change(kind, latest_lift, previous_lift),
    )


def _body_weight_change(
    kind: LoadKind, latest: _Lift, previous: _Lift
) -> BodyWeightChange | None:
    """The footnote's two Performed Body Weights: bodyweight only, both recorded, and
    different at logged precision."""

    if kind is not LoadKind.BODYWEIGHT:
        return None
    if latest.body_weight_kg is None or previous.body_weight_kg is None:
        return None
    if _load_key(latest.body_weight_kg) == _load_key(previous.body_weight_kg):
        return None
    return BodyWeightChange(previous.body_weight_kg, latest.body_weight_kg)


def _best_reps_by_load(lifts: Iterable[_Lift]) -> dict[float, _Lift]:
    """The best-reps lift per load, keyed by the load at logged precision.

    Each value is the lift as logged, so the story reports the load as it was logged, not
    the rounded key.
    """

    best: dict[float, _Lift] = {}
    for lift in lifts:
        key = _load_key(lift.kg)
        current = best.get(key)
        if current is None or lift.reps > current.reps:
            best[key] = lift
    return best


def _heaviest_load_by_reps(lifts: Iterable[_Lift]) -> dict[int, _Lift]:
    """The heaviest lift per rep count."""

    heaviest: dict[int, _Lift] = {}
    for lift in lifts:
        current = heaviest.get(lift.reps)
        if current is None or lift.kg > current.kg:
            heaviest[lift.reps] = lift
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
    "BodyWeightChange",
    "INSUFFICIENT",
    "LOAD_PRECISION_DECIMALS",
    "ProgressStory",
    "StoryAxis",
    "StoryKind",
    "StorySide",
    "progress_story",
    "progress_story_payload",
]
