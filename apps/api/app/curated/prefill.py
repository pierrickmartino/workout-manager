"""Prefill a Curated Protocol's starting weights from the user's records (issue #686, ADR-0130).

A main lift's starting weight is offered as a working-weight fraction of the user's best
Estimated 1RM for that lift, rounded *down* to a loadable increment, and marked as coming from
their ``records``. A lift with no trustworthy history keeps the Curated Protocol's conservative
``default``.

Only an **absolute**-Load set qualifies. The Estimated 1RM is the one yardstick every strength
surface reads (``estimated_1rm_for_set``), which already drops warm-ups and sets outside the
trustworthy rep window; a bodyweight set, which that yardstick can score against a Performed
Body Weight, is excluded here because a barbell starting weight cannot honestly be read off it.

A read-time projection over Logged Sessions: nothing is stored (ADR-0018). The prefill is a
suggestion only — the user edits it, and adopt validates whatever is posted. Pure: no I/O."""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

from app.curated.model import CuratedProtocol
from app.curated.plan import MAX_STARTING_WEIGHT_KG
from app.domain.exercise import normalize_name
from app.domain.load import LoadKind
from app.domain.personal_records import (
    LoggedSession,
    estimated_1rm_for_set,
    logged_set_records,
)

# The share of an Estimated 1RM offered as a first working weight: inside the usual 70–75%
# band, at its conservative end, so the first sessions of a linear progression leave room.
WORKING_WEIGHT_FRACTION = 0.7
# The smallest step a barbell can be loaded by (a pair of 1.25 kg plates); also the step the
# Curated main lifts progress by.
LOADABLE_INCREMENT_KG = 2.5
# Absorbs float error so an exact multiple (0.7 × 125 = 87.5) never floors one step short.
_ROUNDING_TOLERANCE = 1e-9

PrefillSource = Literal["records", "default"]


@dataclass(frozen=True)
class StartingWeightPrefill:
    """The starting weight offered for one main lift, and where it came from."""

    kg: float
    source: PrefillSource


def _best_absolute_1rm_by_name(history: Iterable[LoggedSession]) -> dict[str, float]:
    best: dict[str, float] = {}
    for record in logged_set_records(history):
        if record.load is None or record.load.get("kind") != LoadKind.ABSOLUTE.value:
            continue
        estimate = estimated_1rm_for_set(
            record.load, record.quantity, set_type=record.set_type
        )
        if estimate is None:
            continue
        name = normalize_name(record.exercise_name)
        best[name] = max(estimate, best.get(name, estimate))
    return best


def working_weight_kg(estimated_1rm: float) -> float:
    """The working-weight fraction of ``estimated_1rm``, rounded down to a loadable
    increment and capped at the adopt ceiling. ``0`` when not even one increment fits."""

    steps = math.floor(
        estimated_1rm * WORKING_WEIGHT_FRACTION / LOADABLE_INCREMENT_KG + _ROUNDING_TOLERANCE
    )
    return min(steps * LOADABLE_INCREMENT_KG, MAX_STARTING_WEIGHT_KG)


def starting_weight_prefills(
    curated: CuratedProtocol, history: Iterable[LoggedSession]
) -> Mapping[str, StartingWeightPrefill]:
    """The prefill for each of ``curated``'s main lifts, keyed by the lift's key.

    A lift is matched to its Logged Sets by the Exercise's normalized name, the Catalog's
    identity (ADR-0002)."""

    best = _best_absolute_1rm_by_name(history)
    prefills: dict[str, StartingWeightPrefill] = {}
    for lift in curated.main_lifts:
        estimate = best.get(normalize_name(lift.exercise))
        kg = 0.0 if estimate is None else working_weight_kg(estimate)
        prefills[lift.key] = (
            StartingWeightPrefill(kg=kg, source="records")
            if kg > 0
            else StartingWeightPrefill(kg=lift.default_start_kg, source="default")
        )
    return prefills


__all__ = [
    "LOADABLE_INCREMENT_KG",
    "WORKING_WEIGHT_FRACTION",
    "PrefillSource",
    "StartingWeightPrefill",
    "starting_weight_prefills",
    "working_weight_kg",
]
