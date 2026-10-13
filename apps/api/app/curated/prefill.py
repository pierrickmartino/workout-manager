"""Prefill a Curated Protocol's starting weights from the user's records (issue #686, ADR-0130).

A main lift's starting weight is offered as a working-weight fraction of the user's best
Estimated 1RM for that lift, rounded *down* to a loadable increment, and marked as coming from
their ``records``. A lift with no trustworthy history keeps the Curated Protocol's conservative
``default``.

Only an **absolute**-Load set qualifies. The Estimated 1RM is the one yardstick every strength
surface reads (``estimated_1rm_for_set``), which already drops warm-ups and sets outside the
trustworthy rep window; a bodyweight set, which that yardstick can score against a Performed
Body Weight, is excluded here because a barbell starting weight cannot honestly be read off it.

A wave Curated Protocol asks for a recent **working set** instead (issue #693). Its prefill is the
user's own best qualifying set, its weight and its reps as logged, never a figure derived from
it: the wave is computed from what is entered, so the prefill must be a set the user actually
did. With no such set it is the conservative default weight for ``DEFAULT_WORKING_SET_REPS``.

A read-time projection over Logged Sessions: nothing is stored (ADR-0018). The prefill is a
suggestion only — the user edits it, and adopt validates whatever is posted. Pure: no I/O."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

from app.curated.loading import LOADABLE_INCREMENT_KG, floor_to_loadable
from app.curated.model import CuratedProtocol, MainLift
from app.curated.plan import MAX_STARTING_WEIGHT_KG
from app.domain.exercise import normalize_name
from app.domain.load import LoadKind, ParsedLoad
from app.domain.personal_records import (
    LoggedSession,
    estimated_1rm_for_set,
    logged_set_records,
)
from app.domain.quantity import repetitions_of

# The share of an Estimated 1RM offered as a first working weight: inside the usual 70–75%
# band, at its conservative end, so the first sessions of a linear progression leave room.
WORKING_WEIGHT_FRACTION = 0.7

# The reps a default working set is offered at, beside the lift's conservative default weight.
DEFAULT_WORKING_SET_REPS = 5

PrefillSource = Literal["records", "default"]


@dataclass(frozen=True)
class StartingWeightPrefill:
    """The starting weight offered for one main lift, and where it came from."""

    kg: float
    source: PrefillSource


@dataclass(frozen=True)
class WorkingSetPrefill:
    """The working set offered for one main lift of a wave Curated Protocol, and its source."""

    kg: float
    reps: int
    source: PrefillSource


@dataclass(frozen=True)
class _BestSet:
    estimated_1rm: float
    kg: float
    reps: int


def _best_absolute_sets_by_name(history: Iterable[LoggedSession]) -> dict[str, _BestSet]:
    """Each Exercise's absolute-Load set with the highest Estimated 1RM, by normalized name."""

    best: dict[str, _BestSet] = {}
    for record in logged_set_records(history):
        if record.load is None:
            continue
        load = ParsedLoad.from_dict(record.load)
        reps = repetitions_of(record.quantity)
        if load.kind is not LoadKind.ABSOLUTE or load.kg is None or reps is None:
            continue
        estimate = estimated_1rm_for_set(
            record.load, record.quantity, set_type=record.set_type
        )
        if estimate is None:
            continue
        name = normalize_name(record.exercise_name)
        if name not in best or estimate > best[name].estimated_1rm:
            best[name] = _BestSet(estimate, load.kg, reps)
    return best


def _best_set_for(lift: MainLift, best: Mapping[str, _BestSet]) -> _BestSet | None:
    return best.get(normalize_name(lift.exercise))


def working_weight_kg(estimated_1rm: float) -> float:
    """The working-weight fraction of ``estimated_1rm``, rounded down to a loadable
    increment and capped at the adopt ceiling. ``0`` when not even one increment fits."""

    return min(
        floor_to_loadable(estimated_1rm * WORKING_WEIGHT_FRACTION), MAX_STARTING_WEIGHT_KG
    )


def starting_weight_prefills(
    curated: CuratedProtocol, history: Iterable[LoggedSession]
) -> Mapping[str, StartingWeightPrefill]:
    """The prefill for each of ``curated``'s main lifts, keyed by the lift's key.

    A lift is matched to its Logged Sets by the Exercise's normalized name, the Catalog's
    identity (ADR-0002)."""

    best = _best_absolute_sets_by_name(history)
    prefills: dict[str, StartingWeightPrefill] = {}
    for lift in curated.main_lifts:
        best_set = _best_set_for(lift, best)
        kg = 0.0 if best_set is None else working_weight_kg(best_set.estimated_1rm)
        prefills[lift.key] = (
            StartingWeightPrefill(kg=kg, source="records")
            if kg > 0
            else StartingWeightPrefill(kg=lift.default_start_kg, source="default")
        )
    return prefills


def working_set_prefills(
    curated: CuratedProtocol, history: Iterable[LoggedSession]
) -> Mapping[str, WorkingSetPrefill]:
    """The working set offered for each of ``curated``'s main lifts, keyed by the lift's key:
    the user's own best qualifying set, or the default weight for the default reps."""

    best = _best_absolute_sets_by_name(history)
    return {
        lift.key: (
            WorkingSetPrefill(kg=best_set.kg, reps=best_set.reps, source="records")
            if (best_set := _best_set_for(lift, best)) is not None
            else WorkingSetPrefill(
                kg=lift.default_start_kg, reps=DEFAULT_WORKING_SET_REPS, source="default"
            )
        )
        for lift in curated.main_lifts
    }


__all__ = [
    "DEFAULT_WORKING_SET_REPS",
    "LOADABLE_INCREMENT_KG",
    "WORKING_WEIGHT_FRACTION",
    "PrefillSource",
    "StartingWeightPrefill",
    "WorkingSetPrefill",
    "starting_weight_prefills",
    "working_set_prefills",
    "working_weight_kg",
]
