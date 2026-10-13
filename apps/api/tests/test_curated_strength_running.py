"""The strength and running Curated Protocol adopted end to end (ADR-0130 amendment).

Concurrent training for an intermediate lifter: three lifting Sessions and three run Sessions
alternate through the week, so it is the first Curated Protocol whose Sessions are typed and
timed apart from it. The content ships unreleased, so these tests release it through an injected
registry (the shipped data is never edited) and drive the real list and adopt endpoints over the
``test_curated_protocols_endpoint`` harness."""

from __future__ import annotations

from dataclasses import replace

from app.curated.integrity import integrity_errors
from app.curated.registry import CURATED_PROTOCOLS, get_curated_registry
from app.curated.strength_running import STRENGTH_RUNNING
from tests.test_curated_protocols_endpoint import SIGN_OFF, _Harness, build_harness

RELEASED = replace(STRENGTH_RUNNING, released=True, coach_sign_off=SIGN_OFF)
STARTING_WEIGHTS = {"squat": 80, "bench": 60, "row": 55, "press": 40}
WEEK = [
    ("Lower", "strength", 55),
    ("Easy run", "cardio", 35),
    ("Upper A", "strength", 55),
    ("Intervals", "cardio", 40),
    ("Upper B", "strength", 55),
    ("Long easy run", "cardio", 50),
]
MAIN_LIFTS = {
    "Barbell Back Squat": 80,
    "Barbell Bench Press": 60,
    "Barbell Row": 55,
    "Barbell Overhead Press": 40,
}


def _adopted(weeks: int = 8) -> tuple[_Harness, dict]:
    h = build_harness(RELEASED)
    response = h.adopt(RELEASED.identifier, weeks=weeks, starting_weights_kg=STARTING_WEIGHTS)
    assert response.status_code == 201, response.json()
    return h, h.adopted(response)


def _first_week(protocol: dict) -> list[dict]:
    return protocol["sessions"][: len(WEEK)]


def _runs(protocol: dict) -> list[dict]:
    return [
        p
        for session in protocol["sessions"]
        for p in session["prescriptions"]
        if p["exercise_name"] == "Running"
    ]


def test_released_it_is_listed_as_six_sessions_a_week_for_eight_to_sixteen_weeks():
    # Arrange
    h = build_harness(RELEASED)

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row["identifier"] == "strength-running"
    assert row["name"] == "Strength and running"
    assert row["sessions_per_week"] == 6
    assert (row["min_weeks"], row["max_weeks"]) == (8, 16)
    assert row["required_equipment"] == ["barbell", "rack", "bench", "dumbbell", "cable"]
    assert {lift["key"] for lift in row["main_lifts"]} == set(STARTING_WEIGHTS)


def test_adopting_alternates_lifting_and_run_sessions_each_typed_and_timed_on_its_own():
    # Act
    h, protocol = _adopted(weeks=8)

    # Assert
    assert len(protocol["sessions"]) == 48
    reads = [
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]
        for s in protocol["sessions"]
    ]
    assert [
        (s["title"], read["training_type"], read["duration_minutes"])
        for s, read in zip(protocol["sessions"], reads, strict=True)
    ] == WEEK * 8


def test_main_lifts_start_from_the_users_weights_on_double_progression():
    # Act
    _, protocol = _adopted()

    # Assert
    mains = [
        p
        for session in protocol["sessions"]
        for p in session["prescriptions"]
        if p["exercise_name"] in MAIN_LIFTS
    ]
    assert {(p["sets"], p["reps"], p["scheme"]) for p in mains} == {
        (4, "5-8", "double_progression")
    }
    assert {p["exercise_name"]: p["recommended_load"]["kg"] for p in mains} == MAIN_LIFTS


def test_there_is_no_heavy_deadlift():
    # Act
    _, protocol = _adopted()

    # Assert
    names = {p["exercise_name"] for s in protocol["sessions"] for p in s["prescriptions"]}
    assert "Barbell Deadlift" not in names


def test_runs_are_held_flat_on_static_with_an_effort_cue_and_a_typed_quantity():
    # Act
    _, protocol = _adopted()

    # Assert — the interval repeats are a distance, the rest are durations.
    runs = _runs(protocol)
    assert {p["scheme"] for p in runs} == {"static"}
    assert {p["recommended_load"]["kind"] for p in runs} == {"qualitative"}
    week_one_runs = [
        (p["sets"], p["prescribed_quantity"]["kind"], p["recommended_load"]["text"])
        for s in _first_week(protocol)
        for p in s["prescriptions"]
        if p["exercise_name"] == "Running"
    ]
    assert week_one_runs == [
        (1, "duration", "easy, conversational pace"),
        (1, "duration", "easy, conversational pace"),
        (6, "distance", "hard, about your 5K race effort"),
        (1, "duration", "easy, conversational pace"),
        (1, "duration", "easy, conversational pace"),
    ]


def test_the_interval_repeats_are_four_hundred_metres_with_ninety_seconds_rest():
    # Act
    _, protocol = _adopted()

    # Assert
    (session,) = (s for s in _first_week(protocol) if s["title"] == "Intervals")
    _warm_up, intervals, _cool_down = session["prescriptions"]
    assert intervals["prescribed_quantity"]["metres"] == 400
    assert intervals["rest_seconds"] == 90


def test_the_description_says_run_volume_does_not_progress_and_the_base_it_assumes():
    # Assert
    description = STRENGTH_RUNNING.description
    assert "run targets stay the same every week" in description
    assert "run 30 minutes" in description


def test_it_ships_unreleased_and_is_not_listed():
    # Assert
    assert STRENGTH_RUNNING in CURATED_PROTOCOLS
    assert STRENGTH_RUNNING.released is False
    assert STRENGTH_RUNNING not in get_curated_registry().released()


def test_it_passes_the_integrity_gate_once_released():
    # Act / Assert
    assert integrity_errors(RELEASED) == []
