"""Turn a Curated Protocol plus the user's choices into a fully enumerated plan (ADR-0130).

Pure — no I/O, no catalog. ``validate_choices`` is the boundary check every adopt and preview
runs: a length inside the Curated Protocol's bounds and one positive starting weight
for each main lift, nothing more and nothing less. ``enumerate_plan`` repeats the weekly
pattern to fill the chosen length, so the Protocol is fully enumerated and self-paced
(ADR-0001), and writes each main lift's starting weight as an **absolute** Load. It never writes a ``percent_1rm``
Load. Exercises stay names here; adoption resolves them against the Catalog.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.curated.model import CuratedProtocol, PatternPrescription
from app.domain.load import load_from_input, parse_load
from app.domain.quantity import quantity_from_text
from app.repositories.prescription_mapping import PrescriptionDraft

# A sanity ceiling on a typed starting weight: well above any realistic first working set,
# low enough to catch a slipped extra digit.
MAX_STARTING_WEIGHT_KG = 500.0


@dataclass(frozen=True)
class AdoptionChoices:
    """What the user picks when adopting: the length and a starting weight per main lift."""

    weeks: int
    starting_weights_kg: Mapping[str, float]


@dataclass(frozen=True)
class ChoiceError:
    """One reason the choices are rejected. ``code`` is a stable machine tag; ``main_lift``
    names the offending lift where there is one."""

    code: str
    message: str
    main_lift: str | None = None


@dataclass(frozen=True)
class PlannedPrescription:
    """One enumerated Prescription, still naming its Exercise rather than a catalog id."""

    exercise: str
    sets: int
    reps: str
    rest_seconds: int | None
    recommended_load: dict | None
    prescribed_quantity: dict
    scheme: str

    def to_draft(self, exercise_id: int) -> PrescriptionDraft:
        """The persistable draft once the Exercise has been resolved to ``exercise_id``."""

        return PrescriptionDraft(
            exercise_id=exercise_id,
            sets=self.sets,
            reps=self.reps,
            rest_seconds=self.rest_seconds,
            recommended_load=self.recommended_load,
            prescribed_quantity=self.prescribed_quantity,
            scheme=self.scheme,
        )


@dataclass(frozen=True)
class PlannedSession:
    """One enumerated Week/Day Session."""

    week: int
    day: int
    title: str
    prescriptions: tuple[PlannedPrescription, ...]


def validate_choices(
    curated: CuratedProtocol, choices: AdoptionChoices
) -> list[ChoiceError]:
    """Every reason ``choices`` cannot be adopted for ``curated``, or ``[]``."""

    errors: list[ChoiceError] = []
    if not curated.min_weeks <= choices.weeks <= curated.max_weeks:
        errors.append(
            ChoiceError(
                code="weeks_out_of_range",
                message=(
                    f"Choose a length between {curated.min_weeks} and "
                    f"{curated.max_weeks} weeks."
                ),
            )
        )

    keys = {lift.key for lift in curated.main_lifts}
    for lift in curated.main_lifts:
        weight = choices.starting_weights_kg.get(lift.key)
        if weight is None:
            errors.append(
                ChoiceError(
                    code="missing_starting_weight",
                    message=f"Enter a starting weight for {lift.exercise}.",
                    main_lift=lift.key,
                )
            )
        elif not 0 < weight <= MAX_STARTING_WEIGHT_KG:
            errors.append(
                ChoiceError(
                    code="invalid_starting_weight",
                    message=(
                        f"The starting weight for {lift.exercise} must be more than 0 "
                        f"and at most {MAX_STARTING_WEIGHT_KG:g} kg."
                    ),
                    main_lift=lift.key,
                )
            )
    for key in sorted(set(choices.starting_weights_kg) - keys):
        errors.append(
            ChoiceError(
                code="unknown_main_lift",
                message=f"'{key}' is not a main lift of this Curated Protocol.",
                main_lift=key,
            )
        )
    return errors


def planned_prescription(
    prescription: PatternPrescription, starting_weights_kg: Mapping[str, float]
) -> PlannedPrescription:
    """Enumerate one prescription: a main lift takes its starting weight as an absolute Load;
    anything else keeps its authored Load."""

    if prescription.main_lift is not None:
        weight = starting_weights_kg[prescription.main_lift]
        load = load_from_input("absolute", f"{weight:g}")
    elif prescription.load is not None:
        load = parse_load(prescription.load)
    else:
        load = None
    return PlannedPrescription(
        exercise=prescription.exercise,
        sets=prescription.sets,
        reps=prescription.reps,
        rest_seconds=prescription.rest_seconds,
        recommended_load=None if load is None else load.to_dict(),
        prescribed_quantity=quantity_from_text(prescription.reps).to_dict(),
        scheme=prescription.scheme.value,
    )


def enumerate_plan(
    curated: CuratedProtocol, choices: AdoptionChoices
) -> tuple[PlannedSession, ...]:
    """The weekly pattern repeated ``choices.weeks`` times, Week/Day numbered from 1.

    Callers validate first; a missing starting weight here is a caller bug."""

    return tuple(
        PlannedSession(
            week=week,
            day=day,
            title=session.title,
            prescriptions=tuple(
                planned_prescription(t, choices.starting_weights_kg)
                for t in session.prescriptions
            ),
        )
        for week in range(1, choices.weeks + 1)
        for day, session in enumerate(curated.weekly_pattern, start=1)
    )


__all__ = [
    "MAX_STARTING_WEIGHT_KG",
    "AdoptionChoices",
    "ChoiceError",
    "PlannedPrescription",
    "PlannedSession",
    "validate_choices",
    "planned_prescription",
    "enumerate_plan",
]
