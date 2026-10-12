"""The content-integrity gate every Curated Protocol must pass (ADR-0130).

Curated content is versioned data, so a broken program is caught in the build rather than by a
user. ``integrity_errors`` checks one program and returns every problem:

- every Exercise it names is in the curated seed manifest, so adopting only ever resolves;
- every Prescription passes the prescription spine: it is enumerated exactly as adoption does
  and run through the Deploy gate (``validate_deploy``), the same check a Builder edit faces,
  which also rejects a scheme incompatible with the Load kind;
- no Load is a ``percent_1rm`` (the plan never carries one, ADR-0130);
- each Prescription takes its Load from exactly one place: a declared main lift on that lift's
  own Exercise, or authored Load text;
- the length bounds are valid (1 ≤ min ≤ max, within the Protocol shape bounds);
- main lifts are declared, and each is trained somewhere in the weekly pattern;
- the name carries no third-party brand mark;
- a released program has a recorded coach sign-off.

Pure: no I/O. Exercises are checked against the manifest the migration seeds, not a database.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.curated.exercises import CURATED_EXERCISES
from app.curated.model import CuratedProtocol, PrescriptionTemplate
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

# Third-party program names (someone's mark) a Curated Protocol must not borrow. Lowercase;
# matched as whole words. The Greyskull *scheme* keeps its descriptive internal name, but a
# program title never says it.
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


@dataclass(frozen=True)
class IntegrityError:
    """One integrity problem. ``code`` is a stable tag; ``message`` says where it is."""

    code: str
    message: str


def _seeded_names() -> frozenset[str]:
    return frozenset(item.name for item in CURATED_EXERCISES)


def _templates(program: CuratedProtocol) -> list[tuple[int, PrescriptionTemplate]]:
    return [
        (day, template)
        for day, session in enumerate(program.weekly_pattern, start=1)
        for template in session.prescriptions
    ]


def _brand_errors(program: CuratedProtocol) -> list[IntegrityError]:
    name = program.name.lower()
    return [
        IntegrityError("brand_mark", f"The name '{program.name}' uses the mark '{mark}'.")
        for mark in BRAND_MARKS
        if re.search(rf"(?<![\w/]){re.escape(mark)}(?![\w/])", name)
    ]


def _shape_errors(program: CuratedProtocol) -> list[IntegrityError]:
    errors: list[IntegrityError] = []
    if not MIN_WEEKS <= program.min_weeks <= program.max_weeks <= MAX_WEEKS:
        errors.append(
            IntegrityError(
                "invalid_length_bounds",
                f"Length bounds {program.min_weeks}–{program.max_weeks} must satisfy "
                f"{MIN_WEEKS} ≤ min ≤ max ≤ {MAX_WEEKS}.",
            )
        )
    if not program.main_lifts:
        errors.append(IntegrityError("no_main_lifts", "No main lifts are declared."))
    if program.released and program.coach_sign_off is None:
        errors.append(
            IntegrityError(
                "missing_sign_off", "A released program needs a recorded coach sign-off."
            )
        )
    return errors


def _main_lift_errors(program: CuratedProtocol) -> list[IntegrityError]:
    lifts = {lift.key: lift for lift in program.main_lifts}
    trained = {t.main_lift for _, t in _templates(program)}
    errors = [
        IntegrityError(
            "main_lift_unused", f"Main lift '{key}' is never trained in the pattern."
        )
        for key in lifts
        if key not in trained
    ]
    for day, template in _templates(program):
        if template.main_lift is None:
            continue
        lift = lifts.get(template.main_lift)
        if lift is None:
            errors.append(
                IntegrityError(
                    "unknown_main_lift",
                    f"Day {day}: '{template.main_lift}' is not a declared main lift.",
                )
            )
        elif lift.exercise != template.exercise:
            errors.append(
                IntegrityError(
                    "main_lift_exercise_mismatch",
                    f"Day {day}: main lift '{lift.key}' is {lift.exercise}, "
                    f"not {template.exercise}.",
                )
            )
    return errors


def _prescription_errors(program: CuratedProtocol) -> list[IntegrityError]:
    seeded = _seeded_names()
    errors: list[IntegrityError] = []
    for day, template in _templates(program):
        if template.exercise not in seeded:
            errors.append(
                IntegrityError(
                    "unknown_exercise",
                    f"Day {day}: '{template.exercise}' is not a seeded curated Exercise.",
                )
            )
        if (template.main_lift is None) == (template.load is None):
            errors.append(
                IntegrityError(
                    "ambiguous_load",
                    f"Day {day}: {template.exercise} needs exactly one of a main lift "
                    "or an authored Load.",
                )
            )
        if (
            template.load is not None
            and parse_load(template.load).kind is LoadKind.PERCENT_1RM
        ):
            errors.append(
                IntegrityError(
                    "percent_load",
                    f"Day {day}: {template.exercise} has a percentage Load.",
                )
            )
    return errors


def _spine_errors(program: CuratedProtocol) -> list[IntegrityError]:
    """Enumerate each Session as adoption would (main lifts at their default starting weight)
    and run it through the Deploy gate, the shared prescription-spine check. One Session per
    gate run, so every error is located to its day."""

    declared = {lift.key for lift in program.main_lifts}
    weights = {lift.key: lift.default_start_kg for lift in program.main_lifts}
    errors: list[IntegrityError] = []
    for day, session in enumerate(program.weekly_pattern, start=1):
        draft = DeployDraft(
            weeks=MIN_WEEKS,
            sessions_per_week=1,
            sessions=[
                DraftSession(
                    session_id=None,
                    week=1,
                    day=day,
                    prescriptions=[
                        _draft(planned_prescription(t, weights))
                        for t in session.prescriptions
                        # A dangling main-lift reference is reported elsewhere; it has
                        # no starting weight to enumerate with.
                        if t.main_lift is None or t.main_lift in declared
                    ],
                )
            ],
        )
        errors.extend(
            IntegrityError(error.code, f"Day {day}: {error.message}")
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
    return DraftPrescription(
        exercise_id=0,
        sets=planned.sets,
        reps=planned.reps,
        rest_seconds=planned.rest_seconds,
        recommended_load=planned.recommended_load,
        prescribed_quantity=planned.prescribed_quantity,
        scheme=planned.scheme,
    )


def integrity_errors(program: CuratedProtocol) -> list[IntegrityError]:
    """Every integrity problem with ``program``, or ``[]`` when it may ship."""

    return [
        *_shape_errors(program),
        *_brand_errors(program),
        *_main_lift_errors(program),
        *_prescription_errors(program),
        *_spine_errors(program),
    ]


__all__ = ["BRAND_MARKS", "IntegrityError", "integrity_errors"]
