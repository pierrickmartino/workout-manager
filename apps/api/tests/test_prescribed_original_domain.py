"""Substitution re-expresses the Load and keeps the Prescribed Original (ADR-0143).

Pure rules, no I/O: a kg figure is meaningless across equipment, so a swap to a
movement on different kit re-expresses the Load — bodyweight for a bodyweight
movement, qualitative otherwise — while a swap on the same kit keeps it. The first
Substitution snapshots the Exercise, Load and Progression Scheme; Restore puts all
three back exactly."""

from __future__ import annotations

import pytest

from app.domain.prescribed_original import (
    CHALLENGING_WEIGHT_TEXT,
    PrescribedOriginal,
    PrescriptionState,
    re_express_load,
    restore_changes,
    substitution_changes,
)

ABSOLUTE = {"kind": "absolute", "text": "60kg", "kg": 60.0}
BODYWEIGHT_ADDED = {"kind": "bodyweight", "text": "bodyweight + 10kg", "added_kg": 10.0}
PERCENT = {"kind": "percent_1rm", "text": "70% 1RM", "percent": 70.0}
QUALITATIVE = {"kind": "qualitative", "text": "moderate"}
RANGE = {"kind": "range", "text": "50-60kg", "low_kg": 50.0, "high_kg": 60.0}
EVERY_LOAD_KIND = [ABSOLUTE, BODYWEIGHT_ADDED, PERCENT, QUALITATIVE, RANGE]

BODYWEIGHT_LOAD = {"kind": "bodyweight", "text": "bodyweight"}
CHALLENGING_LOAD = {"kind": "qualitative", "text": CHALLENGING_WEIGHT_TEXT}


@pytest.mark.parametrize("load", EVERY_LOAD_KIND, ids=lambda load: load["kind"])
def test_a_bodyweight_target_gets_a_bodyweight_load(load):
    assert (
        re_express_load(load, original_equipment=["barbell"], target_equipment=[])
        == BODYWEIGHT_LOAD
    )


@pytest.mark.parametrize("load", EVERY_LOAD_KIND, ids=lambda load: load["kind"])
def test_a_target_on_other_equipment_gets_a_qualitative_load(load):
    assert (
        re_express_load(
            load, original_equipment=["barbell"], target_equipment=["dumbbell"]
        )
        == CHALLENGING_LOAD
    )


@pytest.mark.parametrize("load", EVERY_LOAD_KIND, ids=lambda load: load["kind"])
def test_a_target_on_the_same_equipment_keeps_the_load(load):
    # A Variation on the same kit: spelling and order of the strings do not matter.
    assert (
        re_express_load(
            load,
            original_equipment=["Barbell", "rack"],
            target_equipment=["squat rack", "barbells"],
        )
        == load
    )


def test_bodyweight_is_no_equipment_so_bodyweight_to_bodyweight_keeps_the_load():
    assert (
        re_express_load(
            BODYWEIGHT_ADDED, original_equipment=["bodyweight"], target_equipment=[]
        )
        == BODYWEIGHT_ADDED
    )


def test_a_prescription_without_a_load_has_nothing_to_re_express():
    assert (
        re_express_load(None, original_equipment=["barbell"], target_equipment=[])
        is None
    )


def _state(**overrides) -> PrescriptionState:
    values = {
        "exercise_id": 1,
        "exercise_name": "Back Squat",
        "required_equipment": ("barbell",),
        "recommended_load": ABSOLUTE,
        "scheme": "greyskull",
        "prescribed_original": None,
    }
    return PrescriptionState(**{**values, **overrides})


def test_the_first_substitution_snapshots_the_exercise_load_and_scheme():
    changes = substitution_changes(
        _state(), target_exercise_id=2, target_equipment=["dumbbell"]
    )

    assert changes["exercise_id"] == 2
    assert changes["recommended_load"] == CHALLENGING_LOAD
    assert changes["prescribed_original"] == {
        "exercise_id": 1,
        "exercise_name": "Back Squat",
        "recommended_load": ABSOLUTE,
        "scheme": "greyskull",
    }


def test_a_later_substitution_keeps_the_very_first_snapshot():
    first = {
        "exercise_id": 1,
        "exercise_name": "Back Squat",
        "recommended_load": ABSOLUTE,
        "scheme": "greyskull",
    }
    current = _state(
        exercise_id=2,
        exercise_name="Goblet Squat",
        required_equipment=("dumbbell",),
        recommended_load=CHALLENGING_LOAD,
        scheme=None,
        prescribed_original=first,
    )

    changes = substitution_changes(current, target_exercise_id=3, target_equipment=[])

    assert changes["prescribed_original"] == first
    assert changes["recommended_load"] == BODYWEIGHT_LOAD


def test_a_scheme_that_no_longer_fits_the_new_load_falls_back_to_the_default():
    # Greyskull steps a weight axis; a qualitative Load has none.
    changes = substitution_changes(
        _state(scheme="greyskull"), target_exercise_id=2, target_equipment=["dumbbell"]
    )

    assert changes["scheme"] is None


def test_a_scheme_that_still_fits_the_new_load_is_kept():
    changes = substitution_changes(
        _state(scheme="static"), target_exercise_id=2, target_equipment=["dumbbell"]
    )

    assert changes["scheme"] == "static"


def test_restore_puts_back_the_exercise_load_and_scheme_and_clears_the_snapshot():
    original = PrescribedOriginal(
        exercise_id=1,
        exercise_name="Back Squat",
        recommended_load=ABSOLUTE,
        scheme="greyskull",
    )

    assert restore_changes(original.to_dict()) == {
        "exercise_id": 1,
        "recommended_load": ABSOLUTE,
        "scheme": "greyskull",
        "prescribed_original": None,
    }


def test_a_snapshot_round_trips_through_its_stored_form():
    original = PrescribedOriginal(
        exercise_id=1, exercise_name="Back Squat", recommended_load=None, scheme=None
    )

    assert PrescribedOriginal.from_dict(original.to_dict()) == original
