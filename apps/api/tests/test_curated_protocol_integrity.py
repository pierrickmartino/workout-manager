"""The content-integrity gate over every Curated Protocol in the repo (ADR-0130, issue #684).

Curated content is versioned data reviewed in code, so a broken program must fail the build,
never reach a user. ``integrity_errors`` is the gate. The real data must pass it, and each
deliberately broken variant below must fail on exactly the rule it breaks."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.curated.beginner_linear import BEGINNER_LINEAR
from app.curated.integrity import integrity_errors
from app.curated.model import CoachSignOff, PrescriptionTemplate, SessionTemplate
from app.curated.registry import CURATED_PROTOCOLS
from app.domain.progression import ProgressionScheme

SIGN_OFF = CoachSignOff(
    reviewer="Test Coach", credential="Test credential", signed_on=date(2026, 10, 1)
)


def _codes(program) -> set[str]:
    return {error.code for error in integrity_errors(program)}


def _with_extra_prescription(program, template: PrescriptionTemplate):
    first, *rest = program.weekly_pattern
    edited = replace(first, prescriptions=(*first.prescriptions, template))
    return replace(program, weekly_pattern=(edited, *rest))


@pytest.mark.parametrize("program", CURATED_PROTOCOLS, ids=lambda p: p.identifier)
def test_every_shipped_curated_protocol_passes(program):
    assert integrity_errors(program) == []


def test_the_real_content_also_passes_once_released_with_a_sign_off():
    # Arrange
    released = replace(BEGINNER_LINEAR, released=True, coach_sign_off=SIGN_OFF)

    # Act / Assert
    assert integrity_errors(released) == []


def test_an_exercise_outside_the_curated_seed_fails():
    # Arrange
    program = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Barbel Back Squat",
            sets=3,
            reps="8-12",
            scheme=ProgressionScheme.DOUBLE_PROGRESSION,
            load="moderate",
        ),
    )

    # Act / Assert
    assert "unknown_exercise" in _codes(program)


def test_a_scheme_that_does_not_fit_the_load_kind_fails():
    # Arrange — Greyskull steps kilograms; a qualitative Load has none to step
    program = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Dumbbell Curl",
            sets=3,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            load="light",
        ),
    )

    # Act / Assert
    assert "incompatible_scheme" in _codes(program)


@pytest.mark.parametrize(
    ("min_weeks", "max_weeks"), [(0, 4), (6, 4), (-1, -1)], ids=str
)
def test_bad_length_bounds_fail(min_weeks, max_weeks):
    # Arrange
    program = replace(BEGINNER_LINEAR, min_weeks=min_weeks, max_weeks=max_weeks)

    # Act / Assert
    assert "invalid_length_bounds" in _codes(program)


def test_a_program_without_main_lifts_fails():
    # Arrange — drop every main lift and the Prescriptions that pointed at them
    program = replace(
        BEGINNER_LINEAR,
        main_lifts=(),
        weekly_pattern=tuple(
            replace(
                session,
                prescriptions=tuple(
                    t for t in session.prescriptions if t.main_lift is None
                ),
            )
            for session in BEGINNER_LINEAR.weekly_pattern
        ),
    )

    # Act / Assert
    assert "no_main_lifts" in _codes(program)


def test_a_main_lift_the_pattern_never_trains_fails():
    # Arrange — keep the press declared but remove every Prescription of it
    program = replace(
        BEGINNER_LINEAR,
        weekly_pattern=tuple(
            replace(
                session,
                prescriptions=tuple(
                    t for t in session.prescriptions if t.main_lift != "press"
                ),
            )
            for session in BEGINNER_LINEAR.weekly_pattern
        ),
    )

    # Act / Assert
    assert "main_lift_unused" in _codes(program)


def test_a_prescription_naming_an_undeclared_main_lift_fails():
    # Arrange
    program = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Barbell Back Squat",
            sets=3,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            main_lift="front-squat",
        ),
    )

    # Act / Assert
    assert "unknown_main_lift" in _codes(program)


def test_a_main_lift_prescription_on_a_different_exercise_fails():
    # Arrange — the squat lift's weight would land on a deadlift
    program = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Barbell Deadlift",
            sets=1,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            main_lift="squat",
        ),
    )

    # Act / Assert
    assert "main_lift_exercise_mismatch" in _codes(program)


def test_a_prescription_with_both_or_neither_load_source_fails():
    # Arrange
    both = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Barbell Back Squat",
            sets=3,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            main_lift="squat",
            load="60 kg",
        ),
    )
    neither = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Dumbbell Curl",
            sets=3,
            reps="10",
            scheme=ProgressionScheme.STATIC,
        ),
    )

    # Act / Assert
    assert "ambiguous_load" in _codes(both)
    assert "ambiguous_load" in _codes(neither)


def test_a_percentage_load_fails():
    # Arrange — the plan never carries percent_1rm (ADR-0130)
    program = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Dumbbell Curl",
            sets=3,
            reps="10",
            scheme=ProgressionScheme.STATIC,
            load="70%",
        ),
    )

    # Act / Assert
    assert "percent_load" in _codes(program)


def test_a_prescription_that_fails_the_prescription_spine_fails():
    # Arrange — zero sets and no rep target are rejected by the Deploy gate
    program = _with_extra_prescription(
        BEGINNER_LINEAR,
        PrescriptionTemplate(
            exercise="Dumbbell Curl",
            sets=0,
            reps=" ",
            scheme=ProgressionScheme.DOUBLE_PROGRESSION,
            load="light",
        ),
    )

    # Act / Assert
    assert {"invalid_sets", "empty_reps"} <= _codes(program)


def test_an_empty_session_fails():
    # Arrange
    program = replace(
        BEGINNER_LINEAR,
        weekly_pattern=(*BEGINNER_LINEAR.weekly_pattern, SessionTemplate("Rest", ())),
    )

    # Act / Assert
    assert "empty_session" in _codes(program)


def test_a_released_program_without_a_coach_sign_off_fails():
    # Arrange
    program = replace(BEGINNER_LINEAR, released=True, coach_sign_off=None)

    # Act / Assert
    assert "missing_sign_off" in _codes(program)


def test_an_unreleased_program_needs_no_sign_off():
    # Arrange
    program = replace(BEGINNER_LINEAR, released=False, coach_sign_off=None)

    # Act / Assert
    assert "missing_sign_off" not in _codes(program)


@pytest.mark.parametrize(
    "name", ["Starting Strength", "My 5/3/1 cycle", "GZCLP for beginners", "StrongLifts 5x5"]
)
def test_a_name_carrying_a_third_party_brand_mark_fails(name):
    # Arrange
    program = replace(BEGINNER_LINEAR, name=name)

    # Act / Assert
    assert "brand_mark" in _codes(program)


def test_curated_protocol_identifiers_are_unique():
    identifiers = [program.identifier for program in CURATED_PROTOCOLS]
    assert len(identifiers) == len(set(identifiers))
