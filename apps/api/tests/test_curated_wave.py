"""The wave Curated Protocol adopted end to end (issue #693, ADR-0130).

The content ships unreleased, so these tests release it through an injected registry (the
shipped data is never edited) and drive the real list, preview and adopt endpoints over the
``test_curated_protocols_endpoint`` harness. The expected weights are worked by hand from the
known working sets below, not recomputed the way the code does:

- the reference is 90% of the Epley Estimated 1RM, ``kg × (1 + reps/30)``;
- each week's weight is a share of it rounded *down* to 2.5 kg, plus the per-cycle increment
  (5 kg for the squat and deadlift, 2.5 kg for the bench and overhead press) once per cycle."""

from __future__ import annotations

from dataclasses import replace

from app.curated.integrity import integrity_errors
from app.curated.wave import WAVE
from tests.test_curated_protocols_endpoint import (
    SIGN_OFF,
    USER,
    _absolute,
    _Harness,
    build_harness,
)

RELEASED = replace(WAVE, released=True, coach_sign_off=SIGN_OFF)
WORKING_SETS = {
    "squat": {"kg": 100, "reps": 5},
    "bench": {"kg": 80, "reps": 5},
    "deadlift": {"kg": 140, "reps": 3},
    "press": {"kg": 50, "reps": 8},
}
MAIN_LIFTS = {
    "Barbell Back Squat",
    "Barbell Bench Press",
    "Barbell Deadlift",
    "Barbell Overhead Press",
}

# Squat 100 kg × 5: Estimated 1RM 116.7, reference 105.
#   85% 89.25 → 87.5 · 90% 94.5 → 92.5 · 95% 99.75 → 97.5 · deload 60% 63 → 62.5; +5 kg a cycle.
# Bench 80 kg × 5: Estimated 1RM 93.3, reference 84.
#   85% 71.4 → 70 · 90% 75.6 → 75 · 95% 79.8 → 77.5 · deload 60% 50.4 → 50; +2.5 kg a cycle.
# Deadlift 140 kg × 3: Estimated 1RM 154, reference 138.6.
#   85% 117.81 → 117.5 · 90% 124.74 → 122.5 · 95% 131.67 → 130 · 60% 83.16 → 82.5; +5 kg.
# Press 50 kg × 8: Estimated 1RM 63.3, reference 57.
#   85% 48.45 → 47.5 · 90% 51.3 → 50 · 95% 54.15 → 52.5 · 60% 34.2 → 32.5; +2.5 kg.
EXPECTED_KG = {
    "Barbell Back Squat": [87.5, 92.5, 97.5, 62.5, 92.5, 97.5, 102.5, 67.5],
    "Barbell Bench Press": [70, 75, 77.5, 50, 72.5, 77.5, 80, 52.5],
    "Barbell Deadlift": [117.5, 122.5, 130, 82.5, 122.5, 127.5, 135, 87.5],
    "Barbell Overhead Press": [47.5, 50, 52.5, 32.5, 50, 52.5, 55, 35],
}
# Three working weeks of rising intensity, the last set of each as many reps as you can, then
# a deload week of plain fives.
EXPECTED_DOSE = [(3, "5+"), (3, "3+"), (3, "1+"), (3, "5")] * 2


def _body(**overrides) -> dict:
    return {"starting_weights_kg": {}, "working_sets": WORKING_SETS, "weeks": 8, **overrides}


def _logged_harness() -> _Harness:
    """The wave program released, for a user who has logged each main lift once: the coach
    requires a set the user actually did before the weights are worked out (issue #694)."""

    h = build_harness(RELEASED)
    h.log_sets(
        USER,
        *((name, _absolute(60), 5) for name in sorted(MAIN_LIFTS)),
    )
    return h


def _adopted(**overrides) -> tuple[_Harness, dict]:
    h = _logged_harness()
    response = h.adopt(RELEASED.identifier, **_body(**overrides))
    assert response.status_code == 201, response.json()
    return h, h.adopted(response)


def _main_lift_rows(sessions: list[dict]) -> list[tuple[int, dict]]:
    return [
        (session["week"], p)
        for session in sessions
        for p in session["prescriptions"]
        if p["exercise_name"] in MAIN_LIFTS
    ]


def _weekly(sessions: list[dict], name: str, field) -> list:
    return [field(p) for _, p in _main_lift_rows(sessions) if p["exercise_name"] == name]


def test_adopting_writes_each_weeks_wave_and_deload_with_a_per_cycle_increment():
    # Act
    _, protocol = _adopted()

    # Assert
    for name, expected in EXPECTED_KG.items():
        assert _weekly(protocol["sessions"], name, lambda p: p["recommended_load"]["kg"]) == (
            expected
        ), name
        assert _weekly(protocol["sessions"], name, lambda p: (p["sets"], p["reps"])) == (
            EXPECTED_DOSE
        ), name


def test_every_main_lift_is_static_with_an_absolute_load_and_no_load_is_a_percentage():
    # Act
    _, protocol = _adopted()

    # Assert
    main = [p for _, p in _main_lift_rows(protocol["sessions"])]
    assert {(p["scheme"], p["recommended_load"]["kind"]) for p in main} == {
        ("static", "absolute")
    }
    kinds = {
        p["recommended_load"]["kind"]
        for session in protocol["sessions"]
        for p in session["prescriptions"]
    }
    assert "percent_1rm" not in kinds


def test_a_cycle_cut_short_by_the_chosen_length_keeps_its_increment():
    # Week 9 opens the third cycle: the first working week plus two increments.

    # Act
    _, protocol = _adopted(weeks=9)

    # Assert
    squat = _weekly(protocol["sessions"], "Barbell Back Squat", lambda p: p["recommended_load"])
    assert squat[-1] == {"kind": "absolute", "text": "97.5 kg", "kg": 97.5}
    assert len(protocol["sessions"]) == 36


def test_preview_returns_exactly_what_adopt_persists():
    # Arrange
    h = _logged_harness()
    fields = ("exercise_name", "sets", "reps", "recommended_load", "scheme", "rest_seconds")

    def plan(sessions):
        return [
            (s["week"], s["day"], [{f: p[f] for f in fields} for p in s["prescriptions"]])
            for s in sessions
        ]

    # Act
    previewed = h.preview(RELEASED.identifier, **_body()).json()["data"]
    adopted = h.adopted(h.adopt(RELEASED.identifier, **_body()))

    # Assert
    assert plan(previewed["sessions"]) == plan(adopted["sessions"])
    assert _weekly(previewed["sessions"], "Barbell Back Squat", lambda p: p["recommended_load"]["kg"]) == (
        EXPECTED_KG["Barbell Back Squat"]
    )


def _rejected(h: _Harness, response, code: str, main_lift: str | None = None) -> None:
    assert response.status_code == 422, response.json()
    errors = response.json()["errors"]
    assert (code, main_lift) in [(e["code"], e["main_lift"]) for e in errors]
    assert h.row_counts()["Protocol"] == 0


def test_working_sets_are_validated_at_the_boundary_for_preview_and_adopt():
    # Arrange
    h = _logged_harness()
    without_press = {k: v for k, v in WORKING_SETS.items() if k != "press"}
    cases = [
        (without_press, "missing_working_set", "press"),
        ({**WORKING_SETS, "squat": {"kg": 0, "reps": 5}}, "invalid_working_set_weight", "squat"),
        ({**WORKING_SETS, "bench": {"kg": -5, "reps": 5}}, "invalid_working_set_weight", "bench"),
        ({**WORKING_SETS, "bench": {"kg": 501, "reps": 5}}, "invalid_working_set_weight", "bench"),
        ({**WORKING_SETS, "deadlift": {"kg": 140, "reps": 0}}, "invalid_working_set_reps", "deadlift"),
        ({**WORKING_SETS, "press": {"kg": 50, "reps": 13}}, "invalid_working_set_reps", "press"),
        ({**WORKING_SETS, "curl": {"kg": 10, "reps": 8}}, "unknown_main_lift", "curl"),
    ]

    for working_sets, code, lift in cases:
        # Act
        previewed = h.preview(RELEASED.identifier, **_body(working_sets=working_sets))
        adopted = h.adopt(RELEASED.identifier, **_body(working_sets=working_sets))

        # Assert
        _rejected(h, previewed, code, lift)
        _rejected(h, adopted, code, lift)


def test_the_wave_program_refuses_starting_weights():
    # Arrange
    h = _logged_harness()

    # Act
    response = h.adopt(RELEASED.identifier, **_body(starting_weights_kg={"squat": 60}))

    # Assert
    _rejected(h, response, "starting_weight_not_accepted")


def test_a_starting_weight_curated_protocol_refuses_working_sets():
    # Arrange — the default harness releases the beginner linear progression
    h = build_harness()

    # Act
    response = h.adopt(working_sets=WORKING_SETS)

    # Assert
    _rejected(h, response, "working_set_not_accepted")


def test_released_it_is_listed_as_asking_for_a_working_set_per_main_lift():
    # Arrange
    h = build_harness(RELEASED)

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row["identifier"] == "four-week-strength-waves"
    assert row["main_lift_input"] == "working_set"
    assert row["sessions_per_week"] == 4
    assert [lift["key"] for lift in row["main_lifts"]] == ["squat", "bench", "deadlift", "press"]


def test_the_description_discloses_the_one_time_weights_and_the_blind_increment():
    # Assert
    description = WAVE.description
    assert "worked out from it once, when you adopt" in description
    assert "whether or not you hit your reps" in description
    assert "use Calibrate to re-pitch" in description


def test_it_passes_the_integrity_gate():
    # Act / Assert
    assert integrity_errors(RELEASED) == []


def test_no_wave_weight_falls_below_the_empty_bar():
    # A light working set would put every week under 20 kg: bench 20 kg × 5 is a reference of
    # 21, so 85% is 17.85 and the deload 12.6. Each is held at the empty bar instead.

    # Act
    _, protocol = _adopted(working_sets={**WORKING_SETS, "bench": {"kg": 20, "reps": 5}})

    # Assert
    bench = _weekly(protocol["sessions"], "Barbell Bench Press", lambda p: p["recommended_load"])
    assert [load["kg"] for load in bench] == [20, 20, 20, 20, 22.5, 22.5, 22.5, 22.5]


def test_a_lift_with_records_is_prefilled_with_the_users_own_best_set():
    # Arrange — the 100 × 5 squat estimates higher than the 110 × 1, so it is the best set
    h = build_harness(RELEASED)
    h.log_sets(
        USER,
        ("Barbell Back Squat", _absolute(100), 5),
        ("Barbell Back Squat", _absolute(110), 1),
    )

    # Act
    lifts = {lift["key"]: lift for lift in h.list().json()["data"][0]["main_lifts"]}

    # Assert — a lift with no logged set is offered nothing to start from: no default
    assert lifts["squat"]["working_set_prefill"] == {"kg": 100, "reps": 5, "source": "records"}
    assert lifts["deadlift"]["working_set_prefill"] is None


# --- A logged set first (issue #694) ----------------------------------------------------
# The coach's correction: the wave's weights are worked out from a set the user actually did,
# so a main lift with no qualifying logged set can't be adopted or previewed.


def test_the_list_row_names_the_main_lifts_still_needing_a_logged_set():
    # Arrange — only the squat has been logged
    h = build_harness(RELEASED)
    h.log_sets(USER, ("Barbell Back Squat", _absolute(100), 5))

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row["lifts_needing_a_logged_set"] == ["bench", "deadlift", "press"]


def test_once_every_main_lift_is_logged_none_is_named():
    # Act
    row = _logged_harness().list().json()["data"][0]

    # Assert
    assert row["lifts_needing_a_logged_set"] == []


def test_a_starting_weight_curated_protocol_needs_no_logged_set():
    # Arrange — the beginner linear progression, for a user with no history
    h = build_harness()

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row["lifts_needing_a_logged_set"] == []


def test_preview_and_adopt_refuse_a_main_lift_with_no_logged_set():
    # Arrange — everything but the press logged; the posted working sets are otherwise valid
    h = build_harness(RELEASED)
    h.log_sets(
        USER,
        *((name, _absolute(60), 5) for name in sorted(MAIN_LIFTS - {"Barbell Overhead Press"})),
    )

    # Act
    previewed = h.preview(RELEASED.identifier, **_body())
    adopted = h.adopt(RELEASED.identifier, **_body())

    # Assert
    _rejected(h, previewed, "no_logged_working_set", "press")
    _rejected(h, adopted, "no_logged_working_set", "press")


def test_an_out_of_window_set_does_not_count_as_a_logged_working_set():
    # Arrange — a 15-rep squat carries no trustworthy Estimated 1RM, so it can't seed a wave
    h = build_harness(RELEASED)
    h.log_sets(
        USER,
        ("Barbell Back Squat", _absolute(60), 15),
        *((name, _absolute(60), 5) for name in sorted(MAIN_LIFTS - {"Barbell Back Squat"})),
    )

    # Act
    response = h.adopt(RELEASED.identifier, **_body())

    # Assert
    _rejected(h, response, "no_logged_working_set", "squat")


def test_a_starting_weight_curated_protocol_offers_no_working_set_prefill():
    # Arrange — the default harness releases the beginner linear progression
    h = build_harness()

    # Act
    lifts = h.list().json()["data"][0]["main_lifts"]

    # Assert
    assert {lift["working_set_prefill"] for lift in lifts} == {None}
