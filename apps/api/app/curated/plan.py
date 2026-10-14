"""Turn a Curated Protocol plus the user's choices into a fully enumerated plan (ADR-0130).

Pure — no I/O, no catalog. ``validate_choices`` is the boundary check every adopt and preview
runs: a length inside the Curated Protocol's bounds and one input for each main lift, nothing
more and nothing less. That input is a positive starting weight, or for a wave Curated
Protocol a recent **working set** (weight × reps). ``enumerate_plan`` repeats the weekly
pattern to fill the chosen length, so the Protocol is fully enumerated and self-paced
(ADR-0001), and writes every main-lift weight as an **absolute** Load: the starting weight, or
the week's wave computed from the working set (``wave_loads.py``). It never writes a
``percent_1rm`` Load. Exercises stay names here; adoption resolves them against the Catalog.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from app.curated.model import (
    CuratedProtocol,
    MainLift,
    PatternPrescription,
    WavePrescription,
)
from app.curated.wave_loads import WorkingSet, wave_dose, wave_reference_kg
from app.domain.load import load_from_input, parse_load
from app.domain.one_rep_max import MAX_TRUSTWORTHY_REPS, MIN_TRUSTWORTHY_REPS
from app.domain.quantity import quantity_from_text
from app.repositories.prescription_mapping import PrescriptionDraft

# A sanity ceiling on a typed starting weight: well above any realistic first working set,
# low enough to catch a slipped extra digit.
MAX_STARTING_WEIGHT_KG = 500.0


@dataclass(frozen=True)
class AdoptionChoices:
    """What the user picks when adopting: the length and one input per main lift — a starting
    weight, or for a wave Curated Protocol a recent working set."""

    weeks: int
    starting_weights_kg: Mapping[str, float] = field(default_factory=dict)
    working_sets: Mapping[str, WorkingSet] = field(default_factory=dict)


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
    """One enumerated Week/Day Session, typed and timed by its pattern Session."""

    week: int
    day: int
    title: str
    prescriptions: tuple[PlannedPrescription, ...]
    training_type: str
    duration_minutes: int


def _weeks_errors(curated: CuratedProtocol, weeks: int) -> list[ChoiceError]:
    if curated.min_weeks <= weeks <= curated.max_weeks:
        return []
    return [
        ChoiceError(
            code="weeks_out_of_range",
            message=(
                f"Choose a length between {curated.min_weeks} and "
                f"{curated.max_weeks} weeks."
            ),
        )
    ]


def _starting_weight_error(lift: MainLift, weight: float | None) -> ChoiceError | None:
    if weight is None:
        return ChoiceError(
            code="missing_starting_weight",
            message=f"Enter a starting weight for {lift.exercise}.",
            main_lift=lift.key,
        )
    if not 0 < weight <= MAX_STARTING_WEIGHT_KG:
        return ChoiceError(
            code="invalid_starting_weight",
            message=(
                f"The starting weight for {lift.exercise} must be more than 0 "
                f"and at most {MAX_STARTING_WEIGHT_KG:g} kg."
            ),
            main_lift=lift.key,
        )
    return None


def _working_set_error(lift: MainLift, working_set: WorkingSet | None) -> ChoiceError | None:
    if working_set is None:
        return ChoiceError(
            code="missing_working_set",
            message=f"Enter a recent working set for {lift.exercise}.",
            main_lift=lift.key,
        )
    if not 0 < working_set.kg <= MAX_STARTING_WEIGHT_KG:
        return ChoiceError(
            code="invalid_working_set_weight",
            message=(
                f"The working set weight for {lift.exercise} must be more than 0 "
                f"and at most {MAX_STARTING_WEIGHT_KG:g} kg."
            ),
            main_lift=lift.key,
        )
    # The Estimated 1RM the wave is derived from is trustworthy only in this rep window.
    if not MIN_TRUSTWORTHY_REPS <= working_set.reps <= MAX_TRUSTWORTHY_REPS:
        return ChoiceError(
            code="invalid_working_set_reps",
            message=(
                f"The working set for {lift.exercise} must be between "
                f"{MIN_TRUSTWORTHY_REPS} and {MAX_TRUSTWORTHY_REPS} reps."
            ),
            main_lift=lift.key,
        )
    return None


def _input_errors(curated: CuratedProtocol, choices: AdoptionChoices) -> list[ChoiceError]:
    """One error per main lift whose input is missing or out of bounds, then one per input
    keyed by a lift this Curated Protocol doesn't have, then one if the other kind of input
    was sent: a wave Curated Protocol takes working sets only, any other starting weights."""

    is_wave = curated.is_wave
    given: Mapping[str, object] = (
        choices.working_sets if is_wave else choices.starting_weights_kg
    )
    errors: list[ChoiceError] = []
    for lift in curated.main_lifts:
        error = (
            _working_set_error(lift, choices.working_sets.get(lift.key))
            if is_wave
            else _starting_weight_error(lift, choices.starting_weights_kg.get(lift.key))
        )
        if error is not None:
            errors.append(error)
    keys = {lift.key for lift in curated.main_lifts}
    errors.extend(
        ChoiceError(
            code="unknown_main_lift",
            message=f"'{key}' is not a main lift of this Curated Protocol.",
            main_lift=key,
        )
        for key in sorted(set(given) - keys)
    )
    if is_wave and choices.starting_weights_kg:
        errors.append(
            ChoiceError(
                code="starting_weight_not_accepted",
                message="This Curated Protocol takes a recent working set, not a starting weight.",
            )
        )
    if not is_wave and choices.working_sets:
        errors.append(
            ChoiceError(
                code="working_set_not_accepted",
                message="This Curated Protocol takes a starting weight, not a working set.",
            )
        )
    return errors


def validate_choices(
    curated: CuratedProtocol, choices: AdoptionChoices
) -> list[ChoiceError]:
    """Every reason ``choices`` cannot be adopted for ``curated``, or ``[]``."""

    return [*_weeks_errors(curated, choices.weeks), *_input_errors(curated, choices)]


def main_lift_bases_kg(
    curated: CuratedProtocol, choices: AdoptionChoices
) -> dict[str, float]:
    """Each main lift's base weight: its starting weight, or for a wave Curated Protocol the
    reference derived **once** from its working set. Callers validate first."""

    if curated.wave is None:
        return {lift.key: choices.starting_weights_kg[lift.key] for lift in curated.main_lifts}
    return {
        lift.key: wave_reference_kg(curated.wave, choices.working_sets[lift.key])
        for lift in curated.main_lifts
    }


def _absolute(kg: float) -> dict:
    return load_from_input("absolute", f"{kg:g}").to_dict()


def _planned(
    prescription: PatternPrescription | WavePrescription,
    sets: int,
    reps: str,
    recommended_load: dict | None,
) -> PlannedPrescription:
    return PlannedPrescription(
        exercise=prescription.exercise,
        sets=sets,
        reps=reps,
        rest_seconds=prescription.rest_seconds,
        recommended_load=recommended_load,
        prescribed_quantity=quantity_from_text(reps).to_dict(),
        scheme=prescription.scheme.value,
    )


def planned_prescription(
    curated: CuratedProtocol,
    prescription: PatternPrescription | WavePrescription,
    bases_kg: Mapping[str, float],
    week: int,
) -> PlannedPrescription:
    """Enumerate one prescription for ``week``. A wave main lift takes that week's sets, reps
    and weight from the wave; any other main lift takes its starting weight as an absolute
    Load; anything else keeps its authored Load."""

    if isinstance(prescription, WavePrescription):
        if curated.wave is None:
            raise ValueError(f"{prescription.exercise} is waved but there is no wave.")
        lift = curated.main_lift(prescription.main_lift)
        if lift is None:
            raise ValueError(f"'{prescription.main_lift}' is not a declared main lift.")
        dose = wave_dose(curated.wave, bases_kg[lift.key], lift.cycle_increment_kg or 0, week)
        return _planned(prescription, dose.sets, dose.reps, _absolute(dose.kg))
    if prescription.main_lift is not None:
        load = _absolute(bases_kg[prescription.main_lift])
    elif prescription.load is not None:
        load = parse_load(prescription.load).to_dict()
    else:
        load = None
    return _planned(prescription, prescription.sets, prescription.reps, load)


def enumerate_plan(
    curated: CuratedProtocol, choices: AdoptionChoices
) -> tuple[PlannedSession, ...]:
    """The weekly pattern repeated ``choices.weeks`` times, Week/Day numbered from 1.

    Callers validate first; a missing main-lift input here is a caller bug."""

    bases_kg = main_lift_bases_kg(curated, choices)
    return tuple(
        PlannedSession(
            week=week,
            day=day,
            title=session.title,
            prescriptions=tuple(
                planned_prescription(curated, t, bases_kg, week)
                for t in session.prescriptions
            ),
            training_type=curated.session_training_type(session),
            duration_minutes=curated.session_duration_minutes(session),
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
    "WorkingSet",
    "validate_choices",
    "main_lift_bases_kg",
    "planned_prescription",
    "enumerate_plan",
]
