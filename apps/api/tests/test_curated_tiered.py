"""The tiered Curated Protocol adopted end to end (issue #692, ADR-0130).

The content ships unreleased, so these tests release it through an injected registry (the
shipped data is never edited) and drive the real list and adopt endpoints over the
``test_curated_protocols_endpoint`` harness, with the curated Catalog seeded as a migrated
database holds it. Each tier is read back off the adopted Protocol: its Exercises, its
set/rep scheme with the AMRAP last sets, its Progression Scheme and its Load kind."""

from __future__ import annotations

import re
from dataclasses import replace

import pytest

from app.curated.integrity import BRAND_MARKS
from app.curated.registry import CURATED_PROTOCOLS, get_curated_registry
from app.curated.tiered import TIERED
from tests.test_curated_protocols_endpoint import SIGN_OFF, _Harness, build_harness

RELEASED = replace(TIERED, released=True, coach_sign_off=SIGN_OFF)
STARTING_WEIGHTS = {
    "squat": 70,
    "press": 30,
    "bench": 50,
    "deadlift": 90,
    "close_grip_bench": 40,
    "romanian_deadlift": 60,
    "front_squat": 50,
    "incline_bench": 40,
}
T1 = {"Barbell Back Squat", "Barbell Overhead Press", "Barbell Bench Press", "Barbell Deadlift"}
T2 = {
    "Barbell Close-Grip Bench Press",
    "Barbell Romanian Deadlift",
    "Barbell Front Squat",
    "Barbell Incline Bench Press",
}
T3 = {"Lat Pulldown", "Dumbbell Row"}


def _adopted(weeks: int = 6) -> tuple[_Harness, dict]:
    h = build_harness(RELEASED)
    response = h.adopt(RELEASED.identifier, weeks=weeks, starting_weights_kg=STARTING_WEIGHTS)
    assert response.status_code == 201, response.json()
    return h, h.adopted(response)


def _prescriptions(protocol: dict) -> list[dict]:
    return [p for session in protocol["sessions"] for p in session["prescriptions"]]


def _tier(protocol: dict, names: set[str]) -> list[dict]:
    return [p for p in _prescriptions(protocol) if p["exercise_name"] in names]


def test_it_ships_unreleased_without_a_sign_off():
    # Act
    shipped = next(p for p in CURATED_PROTOCOLS if p.identifier == RELEASED.identifier)

    # Assert
    assert shipped.released is False
    assert shipped.coach_sign_off is None


def test_the_real_list_does_not_show_it():
    # Arrange — the shipped registry instead of the one that releases it
    h = build_harness()
    h.client.app.dependency_overrides.pop(get_curated_registry)

    # Act
    identifiers = [row["identifier"] for row in h.list().json()["data"]]

    # Assert
    assert RELEASED.identifier not in identifiers


def test_released_it_is_listed_with_both_weighted_tiers_as_main_lifts():
    # Arrange
    h = build_harness(RELEASED)

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row["identifier"] == "tiered-linear-progression"
    assert row["name"] == "Tiered linear progression"
    assert row["sessions_per_week"] == 4
    assert (row["min_weeks"], row["max_weeks"]) == (6, 16)
    assert row["required_equipment"] == ["barbell", "rack", "bench", "dumbbell", "cable"]
    assert {lift["key"] for lift in row["main_lifts"]} == set(STARTING_WEIGHTS)


def test_adopting_writes_the_chosen_length_of_curated_sessions():
    # Act
    h, protocol = _adopted(weeks=6)

    # Assert
    assert protocol["label"] == "Tiered linear progression"
    assert len(protocol["sessions"]) == 24
    provenances = {
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]["provenance"]
        for s in protocol["sessions"]
    }
    assert provenances == {"curated"}


def test_every_session_has_one_lift_from_each_tier_in_tier_order():
    # Act
    _, protocol = _adopted()

    # Assert
    for session in protocol["sessions"]:
        names = [p["exercise_name"] for p in session["prescriptions"]]
        assert len(names) == 3
        assert (names[0] in T1, names[1] in T2, names[2] in T3) == (True, True, True)


def test_t1_is_five_sets_of_three_with_an_amrap_last_set_on_greyskull_linear():
    # Act
    _, protocol = _adopted()

    # Assert
    t1 = _tier(protocol, T1)
    assert {(p["sets"], p["reps"], p["scheme"]) for p in t1} == {(5, "3+", "greyskull")}
    assert {p["recommended_load"]["kind"] for p in t1} == {"absolute"}


def test_t2_is_three_sets_of_ten_on_double_progression_from_its_own_weights():
    # Act
    _, protocol = _adopted()

    # Assert
    t2 = _tier(protocol, T2)
    assert {(p["sets"], p["reps"], p["scheme"]) for p in t2} == {
        (3, "10", "double_progression")
    }
    assert {p["exercise_name"]: p["recommended_load"]["kg"] for p in t2} == {
        "Barbell Close-Grip Bench Press": 40,
        "Barbell Romanian Deadlift": 60,
        "Barbell Front Squat": 50,
        "Barbell Incline Bench Press": 40,
    }


def test_t3_is_three_sets_of_fifteen_with_an_amrap_last_set_on_double_progression():
    # Act
    _, protocol = _adopted()

    # Assert
    t3 = _tier(protocol, T3)
    assert {(p["sets"], p["reps"], p["scheme"]) for p in t3} == {
        (3, "15+", "double_progression")
    }
    assert {p["recommended_load"]["kind"] for p in t3} == {"qualitative"}


def test_no_tier_shares_an_exercise_with_another():
    # Progression steps every upcoming Prescription of an Exercise from its latest Logged
    # Sets, so a lift shared across tiers would be stepped by the other tier's reps.

    # Act
    _, protocol = _adopted()

    # Assert
    names = {p["exercise_name"] for p in _prescriptions(protocol)}
    assert names == T1 | T2 | T3


def test_the_description_says_a_miss_resets_the_weight():
    # Assert
    assert "resets" in TIERED.description


@pytest.mark.parametrize("scheme", ["6×2", "6x2", "10×1", "10x1", "6 sets of two", "ten singles"])
def test_the_description_claims_no_set_or_rep_change_after_a_miss(scheme):
    # Assert
    assert scheme not in TIERED.description.lower()


@pytest.mark.parametrize("mark", BRAND_MARKS)
def test_the_description_carries_no_brand_mark(mark):
    # Assert
    assert not re.search(rf"(?<![\w/]){re.escape(mark)}(?![\w/])", TIERED.description.lower())
