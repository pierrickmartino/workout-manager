"""Warm-up Suggestion — the pure rules behind the AI warm-up preview (ADR-0143).

A **Warm-up Suggestion** proposes 4–6 general mobility/activation drills for the muscles a
Session works. Everything the generator needs, and everything the API decides without the
model, is derived here from what the plan and the Profile already carry. Pure: no ORM, no
HTTP, no AI.

- :func:`derive_warm_up_input` reads the Session's **working** Prescriptions (the ones the
  Session Section projection does not place in the Warm-up or Cooldown, ADR-0074) and returns
  the muscle set weighted toward the leading movements, the names of movements with no muscle
  data, the equipment set (Session + Profile + bodyweight) and the Sensitive Constraints.
- :func:`leading_warm_up_length` locates the Session's leading Warm-up Section with the same
  projection, so the preview can say "Replace warm-up" and Replace swaps exactly that run.
- :func:`candidate_drills` picks the catalog drills the model may reuse.
- :class:`WarmUpDrill`, :func:`drill_quantity` and :func:`drill_load` are the one shape of a
  drill's one-set prescription — reps or seconds, bodyweight or a named Load, never kg —
  shared by the preview and the add step.

Readiness is deliberately not an input (ADR-0143)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from app.domain.equipment import (
    Equipment,
    missing_equipment,
    normalize_stored_equipment,
)
from app.domain.fitness_profile import SENSITIVE_CONSTRAINT_TYPES
from app.domain.load import LoadKind, ParsedLoad
from app.domain.quantity import Quantity, QuantityKind
from app.domain.session_section import (
    SessionSection,
    reads_as_warm_up_drill,
    sectionize,
)

#: The drill count and time budget every suggestion is held to (ADR-0143).
MIN_DRILLS = 4
MAX_DRILLS = 6
MIN_MINUTES = 5
MAX_MINUTES = 8
#: Warm-up drills keep the rest brisk.
MAX_DRILL_REST_SECONDS = 15
#: How many catalog drills the prompt offers for reuse — enough choice, bounded prompt.
MAX_CANDIDATE_DRILLS = 40
#: Every suggested drill is one set.
DRILL_SETS = 1
#: A drill's reps or seconds: generous for a timed hold, absurd beyond it.
MAX_DRILL_AMOUNT = 120
#: The text of a drill's bodyweight Load.
BODYWEIGHT_TEXT = "bodyweight"

#: A drill is counted in reps or timed in seconds — never a distance.
DrillQuantityKind = Literal[QuantityKind.REPETITIONS, QuantityKind.DURATION]
#: A drill's Load is bodyweight or a named qualitative Load ("light band") — never kg.
DrillLoadKind = Literal[LoadKind.BODYWEIGHT, LoadKind.QUALITATIVE]

_NON_WORKING = frozenset({SessionSection.WARM_UP, SessionSection.COOLDOWN})


class _WarmUpPrescription(Protocol):
    """The Prescription fields the derivation reads (a ``PrescriptionView`` satisfies it)."""

    exercise_name: str
    set_type: str | None
    prescribed_quantity: dict | None
    superset_group: str | None
    targeted_muscles: list[str]
    required_equipment: list[str]


class _CatalogExercise(Protocol):
    name: str
    required_equipment: list[str]


@dataclass(frozen=True)
class WeightedMuscle:
    """One targeted muscle and how strongly the Session leans on it — the leading working
    movements weigh most, so the warm-up prepares what is lifted first and hardest."""

    name: str
    weight: int


@dataclass(frozen=True)
class WarmUpInput:
    """Everything a Warm-up Suggestion is generated from.

    ``muscles`` is ordered most-weighted first. ``unmapped_exercises`` names the working
    movements whose catalog entry carries no muscle data, so a thin catalog never blocks a
    sensible warm-up. ``equipment`` is sorted, deduplicated and always includes bodyweight.
    ``sensitive_constraints`` holds only the recognized Sensitive Constraint types; when it is
    non-empty the suggestion is always generated fresh (ADR-0003)."""

    muscles: tuple[WeightedMuscle, ...]
    unmapped_exercises: tuple[str, ...]
    equipment: tuple[str, ...]
    sensitive_constraints: tuple[str, ...]

    @property
    def has_sensitive_constraint(self) -> bool:
        return bool(self.sensitive_constraints)

    @property
    def muscle_names(self) -> tuple[str, ...]:
        return tuple(muscle.name for muscle in self.muscles)


def _working(prescriptions: Sequence[_WarmUpPrescription]) -> list[_WarmUpPrescription]:
    """The working movements: those sectioned neither warm-up nor cooldown. A Session made
    only of warm-up/cooldown material falls back to every movement, so it still gets a
    targeted warm-up rather than a blank prompt."""

    sections = sectionize(prescriptions)
    working = [
        item for item, section in zip(prescriptions, sections) if section not in _NON_WORKING
    ]
    return working or list(prescriptions)


def _weighted_muscles(working: Sequence[_WarmUpPrescription]) -> tuple[WeightedMuscle, ...]:
    """Union of the working movements' muscles, each scored by the positions it appears in:
    the first of ``n`` movements contributes ``n``, the last ``1``. Ties keep first-seen
    order, so the result is deterministic."""

    count = len(working)
    weights: dict[str, int] = {}
    for index, item in enumerate(working):
        for muscle in dict.fromkeys(m.strip().lower() for m in item.targeted_muscles):
            if muscle:
                weights[muscle] = weights.get(muscle, 0) + (count - index)
    ranked = sorted(weights.items(), key=lambda pair: -pair[1])
    return tuple(WeightedMuscle(name=name, weight=weight) for name, weight in ranked)


def _equipment_set(
    prescriptions: Sequence[_WarmUpPrescription], profile_equipment: Iterable[str]
) -> tuple[str, ...]:
    session_equipment = [
        value for item in prescriptions for value in item.required_equipment
    ]
    normalized = normalize_stored_equipment(
        [*session_equipment, *profile_equipment, Equipment.BODYWEIGHT.value]
    )
    return tuple(sorted(normalized.values))


def derive_warm_up_input(
    prescriptions: Sequence[_WarmUpPrescription],
    *,
    profile_equipment: Iterable[str],
    profile_constraints: Iterable[str],
) -> WarmUpInput:
    """Derive a Warm-up Suggestion's input from one Session's ordered Prescriptions plus the
    owner's Profile (ADR-0143). See :class:`WarmUpInput` for each field's meaning."""

    working = _working(prescriptions)
    unmapped = tuple(
        dict.fromkeys(
            item.exercise_name
            for item in working
            if not any(m.strip() for m in item.targeted_muscles)
        )
    )
    sensitive = tuple(
        sorted({c for c in profile_constraints if c in SENSITIVE_CONSTRAINT_TYPES})
    )
    return WarmUpInput(
        muscles=_weighted_muscles(working),
        unmapped_exercises=unmapped,
        equipment=_equipment_set(prescriptions, profile_equipment),
        sensitive_constraints=sensitive,
    )


def leading_warm_up_length(prescriptions: Sequence[_WarmUpPrescription]) -> int:
    """How many Prescriptions form the Session's leading Warm-up Section (0 when none), read
    through the Session Section projection (ADR-0074)."""

    length = 0
    for section in sectionize(prescriptions):
        if section is not SessionSection.WARM_UP:
            break
        length += 1
    return length


@dataclass(frozen=True)
class WarmUpDrill:
    """One accepted drill: a catalog Exercise, its amount, its typed Load and its rest.

    ``amount`` is a rep count for ``repetitions`` or seconds for ``duration``; the Load is
    ``bodyweight`` or ``qualitative`` (``load_text`` names it, e.g. "light band") — never kg."""

    exercise_id: int
    quantity_kind: DrillQuantityKind
    amount: int
    load_kind: DrillLoadKind
    load_text: str | None
    rest_seconds: int


def drill_quantity(kind: DrillQuantityKind, amount: int) -> Quantity:
    """The typed Prescribed Quantity of a drill: ``amount`` reps, or ``amount`` seconds."""

    if kind is QuantityKind.DURATION:
        return Quantity(kind=kind, text=f"{amount}s", seconds=float(amount))
    return Quantity(kind=QuantityKind.REPETITIONS, text=str(amount), count=amount)


def drill_load(kind: DrillLoadKind, text: str | None) -> ParsedLoad:
    """The typed Load of a drill: bodyweight, or a named qualitative Load."""

    if kind is LoadKind.QUALITATIVE:
        return ParsedLoad(kind=kind, text=(text or "").strip())
    return ParsedLoad(kind=LoadKind.BODYWEIGHT, text=BODYWEIGHT_TEXT)


def drill_load_names_itself(kind: DrillLoadKind, text: str | None) -> bool:
    """Whether a drill's Load is complete: a qualitative Load must say what it is."""

    return kind is not LoadKind.QUALITATIVE or bool((text or "").strip())


def fits_equipment(required: Iterable[str], equipment: Iterable[str]) -> bool:
    """Whether a drill needing ``required`` can be done with the ``equipment`` set."""

    return not missing_equipment(required, equipment)


def candidate_drills(
    catalog: Iterable[_CatalogExercise], equipment: Sequence[str]
) -> tuple[str, ...]:
    """The catalog drills the model may reuse: movements that read as warm-up or mobility
    material and need nothing outside ``equipment``. Alphabetical, capped at
    :data:`MAX_CANDIDATE_DRILLS`."""

    names = sorted(
        exercise.name
        for exercise in catalog
        if reads_as_warm_up_drill(exercise.name)
        and fits_equipment(exercise.required_equipment, equipment)
    )
    return tuple(names[:MAX_CANDIDATE_DRILLS])


__all__ = [
    "BODYWEIGHT_TEXT",
    "DRILL_SETS",
    "MAX_CANDIDATE_DRILLS",
    "MAX_DRILL_AMOUNT",
    "MAX_DRILL_REST_SECONDS",
    "MAX_DRILLS",
    "MAX_MINUTES",
    "MIN_DRILLS",
    "MIN_MINUTES",
    "DrillLoadKind",
    "DrillQuantityKind",
    "WarmUpDrill",
    "WarmUpInput",
    "WeightedMuscle",
    "candidate_drills",
    "derive_warm_up_input",
    "drill_load",
    "drill_load_names_itself",
    "drill_quantity",
    "fits_equipment",
    "leading_warm_up_length",
]
