"""The content-integrity gate over every Curated Protocol in the repo (ADR-0130, issue #684).

Curated content is versioned data reviewed in code, so a broken Curated Protocol must fail the
build, never reach a user. ``integrity_errors`` is the gate. The real data must pass it, and each
deliberately broken variant below must fail on exactly the rule it breaks."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.curated.beginner_linear import BEGINNER_LINEAR
from app.curated.integrity import integrity_errors
from app.curated.model import (
    CoachSignOff,
    PatternPrescription,
    PatternSession,
    WavePrescription,
)
from app.curated.registry import CURATED_PROTOCOLS
from app.curated.wave import WAVE
from app.domain.progression import ProgressionScheme

SIGN_OFF = CoachSignOff(reviewer="Test Coach", signed_on=date(2026, 10, 1))


def _codes(curated) -> set[str]:
    return {error.code for error in integrity_errors(curated)}


def _with_extra_prescription(curated, prescription: PatternPrescription):
    first, *rest = curated.weekly_pattern
    edited = replace(first, prescriptions=(*first.prescriptions, prescription))
    return replace(curated, weekly_pattern=(edited, *rest))


@pytest.mark.parametrize("curated", CURATED_PROTOCOLS, ids=lambda p: p.identifier)
def test_every_shipped_curated_protocol_passes(curated):
    assert integrity_errors(curated) == []


@pytest.mark.parametrize("curated", CURATED_PROTOCOLS, ids=lambda p: p.identifier)
def test_the_real_content_also_passes_once_released_with_a_sign_off(curated):
    # Arrange
    released = replace(curated, released=True, coach_sign_off=SIGN_OFF)

    # Act / Assert
    assert integrity_errors(released) == []


def test_an_exercise_outside_the_curated_seed_fails():
    # Arrange
    curated = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
            exercise="Barbel Back Squat",
            sets=3,
            reps="8-12",
            scheme=ProgressionScheme.DOUBLE_PROGRESSION,
            load="moderate",
        ),
    )

    # Act / Assert
    assert "unknown_exercise" in _codes(curated)


def test_a_scheme_that_does_not_fit_the_load_kind_fails():
    # Arrange — Greyskull steps kilograms; a qualitative Load has none to step
    curated = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
            exercise="Dumbbell Curl",
            sets=3,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            load="light",
        ),
    )

    # Act / Assert
    assert "incompatible_scheme" in _codes(curated)


@pytest.mark.parametrize(
    ("min_weeks", "max_weeks"), [(0, 4), (6, 4), (-1, -1)], ids=str
)
def test_bad_length_bounds_fail(min_weeks, max_weeks):
    # Arrange
    curated = replace(BEGINNER_LINEAR, min_weeks=min_weeks, max_weeks=max_weeks)

    # Act / Assert
    assert "invalid_length_bounds" in _codes(curated)


def test_a_curated_protocol_without_main_lifts_fails():
    # Arrange — drop every main lift and the Prescriptions that pointed at them
    curated = replace(
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
    assert "no_main_lifts" in _codes(curated)


def test_a_main_lift_the_pattern_never_trains_fails():
    # Arrange — keep the press declared but remove every Prescription of it
    curated = replace(
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
    assert "main_lift_unused" in _codes(curated)


def test_a_prescription_naming_an_undeclared_main_lift_fails():
    # Arrange
    curated = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
            exercise="Barbell Back Squat",
            sets=3,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            main_lift="front-squat",
        ),
    )

    # Act / Assert
    assert "unknown_main_lift" in _codes(curated)


def test_a_main_lift_prescription_on_a_different_exercise_fails():
    # Arrange — the squat lift's weight would land on a deadlift
    curated = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
            exercise="Barbell Deadlift",
            sets=1,
            reps="5+",
            scheme=ProgressionScheme.GREYSKULL,
            main_lift="squat",
        ),
    )

    # Act / Assert
    assert "main_lift_exercise_mismatch" in _codes(curated)


def test_a_prescription_with_both_or_neither_load_source_fails():
    # Arrange
    both = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
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
        PatternPrescription(
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
    curated = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
            exercise="Dumbbell Curl",
            sets=3,
            reps="10",
            scheme=ProgressionScheme.STATIC,
            load="70%",
        ),
    )

    # Act / Assert
    assert "percent_load" in _codes(curated)


def test_a_prescription_that_fails_the_prescription_spine_fails():
    # Arrange — zero sets and no rep target are rejected by the Deploy gate
    curated = _with_extra_prescription(
        BEGINNER_LINEAR,
        PatternPrescription(
            exercise="Dumbbell Curl",
            sets=0,
            reps=" ",
            scheme=ProgressionScheme.DOUBLE_PROGRESSION,
            load="light",
        ),
    )

    # Act / Assert
    assert {"invalid_sets", "empty_reps"} <= _codes(curated)


def test_an_empty_session_fails():
    # Arrange
    curated = replace(
        BEGINNER_LINEAR,
        weekly_pattern=(*BEGINNER_LINEAR.weekly_pattern, PatternSession("Rest", ())),
    )

    # Act / Assert
    assert "empty_session" in _codes(curated)


def test_a_released_curated_protocol_without_a_coach_sign_off_fails():
    # Arrange
    curated = replace(BEGINNER_LINEAR, released=True, coach_sign_off=None)

    # Act / Assert
    assert "missing_sign_off" in _codes(curated)


# The four programs the review for issue #694 approved; later content ships unreleased until its
# own sign-off is recorded.
REVIEWED_IN_694 = (
    "beginner-linear-progression",
    "push-pull-legs",
    "tiered-linear-progression",
    "four-week-strength-waves",
)
REVIEWED = [p for p in CURATED_PROTOCOLS if p.identifier in REVIEWED_IN_694]


def test_every_program_reviewed_in_694_is_still_shipped():
    # Assert — a renamed identifier must not silently drop out of the sign-off check below.
    assert [p.identifier for p in REVIEWED] == list(REVIEWED_IN_694)


@pytest.mark.parametrize("curated", REVIEWED, ids=lambda p: p.identifier)
def test_every_curated_protocol_reviewed_in_694_is_released_with_a_named_sign_off(curated):
    # Assert
    assert curated.released is True
    assert curated.coach_sign_off == CoachSignOff(
        reviewer="Pierrick Martino", signed_on=date(2026, 10, 13)
    )


@pytest.mark.parametrize("reviewer", ["", "   "])
def test_a_sign_off_without_a_reviewer_name_fails(reviewer):
    # Arrange
    curated = replace(
        BEGINNER_LINEAR,
        released=True,
        coach_sign_off=CoachSignOff(reviewer=reviewer, signed_on=date(2026, 10, 1)),
    )

    # Act / Assert
    assert "missing_sign_off" in _codes(curated)


def test_an_unreleased_curated_protocol_needs_no_sign_off():
    # Arrange
    curated = replace(BEGINNER_LINEAR, released=False, coach_sign_off=None)

    # Act / Assert
    assert "missing_sign_off" not in _codes(curated)


@pytest.mark.parametrize(
    "name", ["Starting Strength", "My 5/3/1 cycle", "GZCLP for beginners", "StrongLifts 5x5"]
)
def test_a_name_carrying_a_third_party_brand_mark_fails(name):
    # Arrange
    curated = replace(BEGINNER_LINEAR, name=name)

    # Act / Assert
    assert "brand_mark" in _codes(curated)


def test_a_description_carrying_a_third_party_brand_mark_fails():
    # Arrange
    curated = replace(BEGINNER_LINEAR, description="Linear gains, much like GZCLP.")

    # Act / Assert
    assert "brand_mark" in _codes(curated)


def test_curated_protocol_identifiers_are_unique():
    identifiers = [curated.identifier for curated in CURATED_PROTOCOLS]
    assert len(identifiers) == len(set(identifiers))


# --- Wave content (issue #693) -----------------------------------------------------------


def test_a_waved_main_lift_in_a_curated_protocol_without_a_wave_fails():
    # Arrange — the beginner program declares no wave to take the dose from
    curated = _with_extra_prescription(
        BEGINNER_LINEAR, WavePrescription(exercise="Barbell Back Squat", main_lift="squat")
    )

    # Act / Assert
    assert "wave_missing" in _codes(curated)


def test_a_wave_main_lift_that_is_not_waved_fails():
    # Arrange — a plain Prescription would skip the waves and deloads
    curated = _with_extra_prescription(
        WAVE,
        PatternPrescription(
            exercise="Barbell Back Squat",
            sets=3,
            reps="5",
            scheme=ProgressionScheme.STATIC,
            main_lift="squat",
        ),
    )

    # Act / Assert
    assert "main_lift_not_waved" in _codes(curated)


def test_a_wave_main_lift_without_a_cycle_increment_fails():
    # Arrange
    squat, *rest = WAVE.main_lifts
    curated = replace(WAVE, main_lifts=(replace(squat, cycle_increment_kg=None), *rest))

    # Act / Assert
    assert "invalid_cycle_increment" in _codes(curated)


def test_a_cycle_increment_outside_a_wave_fails():
    # Arrange
    squat, *rest = BEGINNER_LINEAR.main_lifts
    curated = replace(
        BEGINNER_LINEAR, main_lifts=(replace(squat, cycle_increment_kg=5.0), *rest)
    )

    # Act / Assert
    assert "invalid_cycle_increment" in _codes(curated)


@pytest.mark.parametrize("training_type", ["running", "Cardio", ""])
def test_a_session_overriding_the_training_type_outside_the_closed_set_fails(training_type):
    # Arrange
    first, *rest = BEGINNER_LINEAR.weekly_pattern
    curated = replace(
        BEGINNER_LINEAR,
        weekly_pattern=(replace(first, training_type=training_type), *rest),
    )

    # Act / Assert
    assert "unknown_training_type" in _codes(curated)


def test_a_session_overriding_the_training_type_inside_the_closed_set_passes():
    # Arrange
    first, *rest = BEGINNER_LINEAR.weekly_pattern
    curated = replace(
        BEGINNER_LINEAR,
        weekly_pattern=(replace(first, training_type="cardio"), *rest),
    )

    # Act / Assert
    assert integrity_errors(curated) == []


def test_a_curated_protocol_training_type_outside_the_closed_set_fails():
    # Arrange
    curated = replace(BEGINNER_LINEAR, training_type="powerlifting")

    # Act / Assert
    assert "unknown_training_type" in _codes(curated)


@pytest.mark.parametrize("duration_minutes", [0, -10])
def test_a_session_overriding_the_duration_with_a_non_positive_value_fails(duration_minutes):
    # Arrange
    first, *rest = BEGINNER_LINEAR.weekly_pattern
    curated = replace(
        BEGINNER_LINEAR,
        weekly_pattern=(replace(first, duration_minutes=duration_minutes), *rest),
    )

    # Act / Assert
    assert "invalid_duration" in _codes(curated)
