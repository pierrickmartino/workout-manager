"""The content-integrity gate every Curated Protocol must pass (ADR-0130).

Curated content is versioned data, so a broken Curated Protocol is caught in the build, not by a
user. ``integrity_errors`` checks one Curated Protocol and returns every problem:

- every Exercise it names is in the curated seed manifest, so adopting only ever resolves;
- every Prescription passes the prescription spine: it is enumerated exactly as adoption does
  and run through the Deploy gate (``validate_deploy``), the same check a Builder edit faces,
  which also rejects a scheme incompatible with the Load kind;
- no Load is a ``percent_1rm`` (the plan never carries one, ADR-0130);
- each Prescription takes its Load from exactly one place: a declared main lift on that lift's
  own Exercise, or authored Load text;
- the length bounds are valid (1 ≤ min ≤ max, within the Protocol shape bounds);
- the Training Type, and any a Session overrides it with, is in the closed set, and a Session's
  overriding duration is positive;
- main lifts are declared, and each is trained somewhere in the weekly pattern;
- a wave Curated Protocol waves every main lift, each with a positive per-cycle increment, and
  only a wave Curated Protocol waves anything or declares an increment (issue #693);
- neither the name nor the description carries a third-party brand mark;
- a released Curated Protocol has a recorded sign-off naming its reviewer.

Pure: no I/O. Exercises are checked against the manifest the migration seeds, not a database.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass

from app.curated.exercises import CURATED_EXERCISES
from app.curated.model import CuratedProtocol, PatternPrescription, WavePrescription
from app.curated.plan import PlannedPrescription, planned_prescription
from app.domain.load import LoadKind, parse_load
from app.protocols.deploy_validation import (
    MAX_WEEKS,
    MIN_WEEKS,
    DeployDraft,
    DraftPrescription,
    DraftSession,
    validate_deploy,
)

# Third-party training-plan names (someone's mark) a Curated Protocol must not borrow. Lowercase;
# matched as whole words. The Greyskull *scheme* keeps its descriptive internal name, but a
# Curated Protocol's name and description never say it.
BRAND_MARKS: tuple[str, ...] = (
    "starting strength",
    "stronglifts",
    "5/3/1",
    "531",
    "wendler",
    "gzcl",
    "gzclp",
    "greyskull",
    "texas method",
    "madcow",
    "nsuns",
    "phul",
    "phat",
    "candito",
    "smolov",
    "sheiko",
)

# The closed Training Type set (GLOSSARY 'Training Type'): a Curated Protocol, and any Session
# typed apart from it, is typed by one of these, never an invented kind.
TRAINING_TYPES: frozenset[str] = frozenset({"strength", "cardio", "hiit", "yoga", "mobility"})


@dataclass(frozen=True)
class IntegrityError:
    """One integrity problem. ``code`` is a stable tag; ``message`` says where it is."""

    code: str
    message: str


def _seeded_names() -> frozenset[str]:
    return frozenset(item.name for item in CURATED_EXERCISES)


def _pattern_prescriptions(
    curated: CuratedProtocol,
) -> list[tuple[int, PatternPrescription | WavePrescription]]:
    return [
        (day, prescription)
        for day, session in enumerate(curated.weekly_pattern, start=1)
        for prescription in session.prescriptions
    ]


def _brand_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    return [
        IntegrityError("brand_mark", f"The {field} uses the mark '{mark}'.")
        for field, text in (("name", curated.name), ("description", curated.description))
        for mark in BRAND_MARKS
        if re.search(rf"(?<![\w/]){re.escape(mark)}(?![\w/])", text.lower())
    ]


def _shape_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    errors: list[IntegrityError] = []
    if not MIN_WEEKS <= curated.min_weeks <= curated.max_weeks <= MAX_WEEKS:
        errors.append(
            IntegrityError(
                "invalid_length_bounds",
                f"Length bounds {curated.min_weeks}–{curated.max_weeks} must satisfy "
                f"{MIN_WEEKS} ≤ min ≤ max ≤ {MAX_WEEKS}.",
            )
        )
    if not curated.main_lifts:
        errors.append(IntegrityError("no_main_lifts", "No main lifts are declared."))
    sign_off = curated.coach_sign_off
    if curated.released and (sign_off is None or not sign_off.reviewer.strip()):
        errors.append(
            IntegrityError(
                "missing_sign_off",
                "A released Curated Protocol needs a recorded sign-off naming its reviewer.",
            )
        )
    return errors


def _session_kind_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    errors = [
        IntegrityError(
            "unknown_training_type",
            f"{where}: '{training_type}' is not a Training Type.",
        )
        for where, training_type in (
            ("The Curated Protocol", curated.training_type),
            *(
                (f"Day {day}", session.training_type)
                for day, session in enumerate(curated.weekly_pattern, start=1)
                if session.training_type is not None
            ),
        )
        if training_type not in TRAINING_TYPES
    ]
    errors.extend(
        IntegrityError(
            "invalid_duration", f"Day {day}: a duration must be a positive number of minutes."
        )
        for day, session in enumerate(curated.weekly_pattern, start=1)
        if session.duration_minutes is not None and session.duration_minutes <= 0
    )
    return errors


def _main_lift_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    lifts = {lift.key: lift for lift in curated.main_lifts}
    trained = {t.main_lift for _, t in _pattern_prescriptions(curated)}
    errors = [
        IntegrityError(
            "main_lift_unused", f"Main lift '{key}' is never trained in the pattern."
        )
        for key in lifts
        if key not in trained
    ]
    for day, prescription in _pattern_prescriptions(curated):
        if prescription.main_lift is None:
            continue
        lift = lifts.get(prescription.main_lift)
        if lift is None:
            errors.append(
                IntegrityError(
                    "unknown_main_lift",
                    f"Day {day}: '{prescription.main_lift}' is not a declared main lift.",
                )
            )
        elif lift.exercise != prescription.exercise:
            errors.append(
                IntegrityError(
                    "main_lift_exercise_mismatch",
                    f"Day {day}: main lift '{lift.key}' is {lift.exercise}, "
                    f"not {prescription.exercise}.",
                )
            )
    return errors


def _wave_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    is_wave = curated.is_wave
    errors = [
        IntegrityError(
            "invalid_cycle_increment",
            f"Main lift '{lift.key}' needs a positive cycle increment in a wave and none "
            "outside one.",
        )
        for lift in curated.main_lifts
        if (
            (lift.cycle_increment_kg is None or lift.cycle_increment_kg <= 0)
            if is_wave
            else lift.cycle_increment_kg is not None
        )
    ]
    for day, prescription in _pattern_prescriptions(curated):
        waved = isinstance(prescription, WavePrescription)
        if waved and not is_wave:
            errors.append(
                IntegrityError(
                    "wave_missing",
                    f"Day {day}: {prescription.exercise} is waved, but there is no wave.",
                )
            )
        elif is_wave and prescription.main_lift is not None and not waved:
            errors.append(
                IntegrityError(
                    "main_lift_not_waved",
                    f"Day {day}: main lift {prescription.exercise} must follow the wave.",
                )
            )
    return errors


def _enumerable(
    curated: CuratedProtocol,
    prescription: PatternPrescription | WavePrescription,
    declared: set[str],
) -> bool:
    """Whether the spine check can enumerate ``prescription``. A dangling main-lift reference,
    or a waved lift with no wave, is reported elsewhere and has nothing to enumerate with."""

    if prescription.main_lift is not None and prescription.main_lift not in declared:
        return False
    return curated.is_wave or not isinstance(prescription, WavePrescription)


def _prescription_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    seeded = _seeded_names()
    errors: list[IntegrityError] = []
    for day, prescription in _pattern_prescriptions(curated):
        if prescription.exercise not in seeded:
            errors.append(
                IntegrityError(
                    "unknown_exercise",
                    f"Day {day}: '{prescription.exercise}' is not a seeded curated Exercise.",
                )
            )
        if (prescription.main_lift is None) == (prescription.load is None):
            errors.append(
                IntegrityError(
                    "ambiguous_load",
                    f"Day {day}: {prescription.exercise} needs exactly one of a main lift "
                    "or an authored Load.",
                )
            )
        if (
            prescription.load is not None
            and parse_load(prescription.load).kind is LoadKind.PERCENT_1RM
        ):
            errors.append(
                IntegrityError(
                    "percent_load",
                    f"Day {day}: {prescription.exercise} has a percentage Load.",
                )
            )
    return errors


def _spine_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    """Enumerate each Session as adoption would (main lifts at their default starting weight,
    taken as the reference of a wave) and run it through the Deploy gate, the shared
    prescription-spine check. A wave Curated Protocol is enumerated over one whole cycle, so
    every week's dose faces the gate. One Session per gate run, so every error is located."""

    declared = {lift.key for lift in curated.main_lifts}
    bases_kg = {lift.key: lift.default_start_kg for lift in curated.main_lifts}
    weeks = 1 if curated.wave is None else curated.wave.cycle_weeks
    errors: list[IntegrityError] = []
    for week in range(1, weeks + 1):
        for day, session in enumerate(curated.weekly_pattern, start=1):
            where = f"Week {week} Day {day}" if curated.is_wave else f"Day {day}"
            draft = DeployDraft(
                weeks=MIN_WEEKS,
                sessions_per_week=1,
                sessions=[
                    DraftSession(
                        session_id=None,
                        week=1,
                        day=day,
                        prescriptions=[
                            _draft(planned_prescription(curated, t, bases_kg, week))
                            for t in session.prescriptions
                            if _enumerable(curated, t, declared)
                        ],
                    )
                ],
            )
            errors.extend(
                IntegrityError(error.code, f"{where}: {error.message}")
                for error in validate_deploy(
                    draft,
                    performed_session_ids=set(),
                    known_session_ids=set(),
                    exercise_exists=lambda _id: True,
                )
            )
    return errors


def _draft(planned: PlannedPrescription) -> DraftPrescription:
    # The catalog id is irrelevant here: Exercise names are checked against the seed manifest.
    return DraftPrescription(**asdict(planned.to_draft(exercise_id=0)))


def integrity_errors(curated: CuratedProtocol) -> list[IntegrityError]:
    """Every integrity problem with ``curated``, or ``[]`` when it may ship."""

    return [
        *_shape_errors(curated),
        *_brand_errors(curated),
        *_session_kind_errors(curated),
        *_main_lift_errors(curated),
        *_wave_errors(curated),
        *_prescription_errors(curated),
        *_spine_errors(curated),
    ]


__all__ = ["BRAND_MARKS", "TRAINING_TYPES", "IntegrityError", "integrity_errors"]
