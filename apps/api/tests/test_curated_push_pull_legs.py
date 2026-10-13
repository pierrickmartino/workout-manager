"""The push/pull/legs Curated Protocol adopted end to end (issue #691, ADR-0130).

The content ships unreleased, so these tests release it through an injected registry (the
shipped data is never edited) and drive the real list and adopt endpoints over the
``test_curated_protocols_endpoint`` harness, with the curated Catalog seeded as a migrated
database holds it. The real registry must keep it out of the list."""

from __future__ import annotations

from dataclasses import replace

from app.curated.push_pull_legs import PUSH_PULL_LEGS
from app.curated.registry import CURATED_PROTOCOLS, get_curated_registry
from tests.test_curated_protocols_endpoint import SIGN_OFF, _Harness, build_harness

RELEASED = replace(PUSH_PULL_LEGS, released=True, coach_sign_off=SIGN_OFF)
STARTING_WEIGHTS = {"bench": 50, "press": 30, "row": 45, "deadlift": 90, "squat": 70}


def _adopted(weeks: int) -> tuple[_Harness, dict]:
    h = build_harness(RELEASED)
    response = h.adopt(
        RELEASED.identifier, weeks=weeks, starting_weights_kg=STARTING_WEIGHTS
    )
    assert response.status_code == 201, response.json()
    return h, h.adopted(response)


def _prescriptions(protocol: dict) -> list[dict]:
    return [p for session in protocol["sessions"] for p in session["prescriptions"]]


def _is_main_lift(prescription: dict) -> bool:
    return prescription["exercise_name"] in {lift.exercise for lift in RELEASED.main_lifts}


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


def test_released_it_is_listed_with_its_main_lifts_and_equipment():
    # Arrange
    h = build_harness(RELEASED)

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row["identifier"] == "push-pull-legs"
    assert row["name"] == "Push, pull, legs"
    assert row["sessions_per_week"] == 3
    assert (row["min_weeks"], row["max_weeks"]) == (6, 16)
    assert row["required_equipment"] == ["barbell", "rack", "bench", "dumbbell", "cable"]
    assert [lift["key"] for lift in row["main_lifts"]] == [
        "bench",
        "press",
        "row",
        "deadlift",
        "squat",
    ]


def test_adopting_writes_the_chosen_length_of_curated_sessions():
    # Act
    h, protocol = _adopted(weeks=8)

    # Assert
    assert protocol["label"] == "Push, pull, legs"
    assert len(protocol["sessions"]) == 24
    assert [s["title"] for s in protocol["sessions"][:4]] == ["Push", "Pull", "Legs", "Push"]
    provenances = {
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]["provenance"]
        for s in protocol["sessions"]
    }
    assert provenances == {"curated"}


def test_every_prescription_is_on_double_progression():
    # Act
    _, protocol = _adopted(weeks=6)

    # Assert
    assert {p["scheme"] for p in _prescriptions(protocol)} == {"double_progression"}


def test_main_lifts_carry_the_starting_weights_as_absolute_loads():
    # Act
    _, protocol = _adopted(weeks=6)

    # Assert
    loads = {
        p["exercise_name"]: p["recommended_load"]
        for p in _prescriptions(protocol)
        if _is_main_lift(p)
    }
    assert loads == {
        "Barbell Bench Press": {"kind": "absolute", "text": "50 kg", "kg": 50},
        "Barbell Overhead Press": {"kind": "absolute", "text": "30 kg", "kg": 30},
        "Barbell Row": {"kind": "absolute", "text": "45 kg", "kg": 45},
        "Barbell Deadlift": {"kind": "absolute", "text": "90 kg", "kg": 90},
        "Barbell Back Squat": {"kind": "absolute", "text": "70 kg", "kg": 70},
    }


def test_accessories_carry_qualitative_loads():
    # Act
    _, protocol = _adopted(weeks=6)

    # Assert
    kinds = {
        p["recommended_load"]["kind"]
        for p in _prescriptions(protocol)
        if not _is_main_lift(p)
    }
    assert kinds == {"qualitative"}
