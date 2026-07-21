"""Personal Record detection (F3 Slice 4) — read-time over the *record* side.

``detect_personal_records`` walks a chronological stream of Logged Sets and reports,
per Exercise, every set whose Estimated 1RM beats every prior set's for that Exercise.
There is no PR table and no write hook: a PR is derived purely from Logged Sets, so a
back-dated or corrected log recomputes honestly. Only ``absolute``-Load sets with
integer reps in the trustworthy 1–12 window can set one; everything else is skipped.
Pure and dependency-free — exercised here with hand-built Logged Set records."""

from __future__ import annotations

from datetime import date

from app.domain.load import LoadKind, ParsedLoad
from app.domain.personal_records import (
    LoggedSetRecord,
    detect_personal_records,
    estimated_1rm_for_set,
)

SQUAT = 1
PRESS = 2


def _absolute(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _set(exercise_id, name, kg, reps, performed_on) -> LoggedSetRecord:
    return LoggedSetRecord(
        exercise_id=exercise_id,
        exercise_name=name,
        reps=reps,
        load=_absolute(kg),
        performed_on=performed_on,
    )


def test_the_first_ever_set_for_an_exercise_is_a_personal_record():
    # Arrange — a single absolute-load Squat set, 100 kg × 1
    history = [_set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 1))]

    # Act
    records = detect_personal_records(history)

    # Assert — the first set an Exercise ever sees always sets a PR
    assert len(records) == 1
    assert records[0].exercise_name == "Back Squat"
    assert records[0].estimated_1rm == 100.0
    assert records[0].performed_on == date(2026, 6, 1)


def test_a_strictly_heavier_estimate_sets_a_new_record():
    # Arrange — 100 kg then a heavier 110 kg single, same Exercise
    history = [
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 1)),
        _set(SQUAT, "Back Squat", 110.0, 1, date(2026, 6, 8)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — both fire; the second's gain is the improvement over the first
    assert [r.estimated_1rm for r in records] == [100.0, 110.0]
    assert records[1].gain == 10.0


def test_a_lighter_estimate_never_sets_a_record():
    # Arrange — a strong opener then a lighter follow-up
    history = [
        _set(SQUAT, "Back Squat", 120.0, 1, date(2026, 6, 1)),
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 8)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — only the opener records
    assert [r.estimated_1rm for r in records] == [120.0]


def test_an_equal_estimate_does_not_double_fire():
    # Arrange — the exact same working set logged twice
    history = [
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 1)),
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 8)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — a tie is not a new record; only the first fires
    assert len(records) == 1


def test_records_are_scoped_per_exercise():
    # Arrange — a first-ever set for two different Exercises
    history = [
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 1)),
        _set(PRESS, "Overhead Press", 60.0, 1, date(2026, 6, 1)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — each Exercise's first set is its own PR; neither blocks the other
    assert {r.exercise_name for r in records} == {"Back Squat", "Overhead Press"}


def test_a_heavier_estimated_max_at_more_reps_outranks_a_lighter_true_single():
    # Arrange — a 100 kg single, then 90 kg × 5 (Epley ≈ 105 kg estimated)
    history = [
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 1)),
        _set(SQUAT, "Back Squat", 90.0, 5, date(2026, 6, 8)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — the estimated max at five reps beats the lighter true single
    assert len(records) == 2
    assert records[1].estimated_1rm == 90.0 * (1 + 5 / 30)


def test_non_absolute_loads_can_never_set_a_record():
    # Arrange — a bodyweight set and a qualitative set: neither carries a comparable kg
    bodyweight = LoggedSetRecord(
        exercise_id=PRESS,
        exercise_name="Push-up",
        reps=10,
        load=ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict(),
        performed_on=date(2026, 6, 1),
    )
    qualitative = LoggedSetRecord(
        exercise_id=PRESS,
        exercise_name="Push-up",
        reps=10,
        load=ParsedLoad(kind=LoadKind.QUALITATIVE, text="hard").to_dict(),
        performed_on=date(2026, 6, 2),
    )

    # Act
    records = detect_personal_records([bodyweight, qualitative])

    # Assert — no comparable strength figure, so no PR
    assert records == []


def test_a_high_rep_set_is_skipped_and_does_not_block_a_later_pr():
    # Arrange — an untrustworthy 20-rep set, then a real 100 kg single
    history = [
        _set(SQUAT, "Back Squat", 60.0, 20, date(2026, 6, 1)),
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 8)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — the AMRAP set neither records nor sets a bar the single must clear
    assert len(records) == 1
    assert records[0].estimated_1rm == 100.0


def test_detection_is_chronological_regardless_of_input_order():
    # Arrange — the heavier set is newer but handed in first (newest-first, as the
    # repository returns it)
    history = [
        _set(SQUAT, "Back Squat", 110.0, 1, date(2026, 6, 8)),
        _set(SQUAT, "Back Squat", 100.0, 1, date(2026, 6, 1)),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — read oldest-first: 100 kg records, then 110 kg beats it
    assert [r.estimated_1rm for r in records] == [100.0, 110.0]
    assert records[1].gain == 10.0


# --- estimated_1rm_for_set: bodyweight scoring against Performed Body Weight (ADR-0026) ---


def _bodyweight(added_kg: float | None = None) -> dict:
    """The stored typed-Load dict for a bodyweight (optionally + added) load."""

    text = "bodyweight" if added_kg is None else f"bodyweight + {added_kg:g} kg"
    return ParsedLoad(kind=LoadKind.BODYWEIGHT, text=text, added_kg=added_kg).to_dict()


def test_bodyweight_set_with_captured_mass_scores_via_epley():
    # Arrange — a pure bodyweight set of 5 reps at a captured mass of 80 kg
    load = _bodyweight()

    # Act — the mass resolves the set to 80 kg-equivalent and Epley scores it
    estimate = estimated_1rm_for_set(load, 5, body_weight_kg=80.0)

    # Assert — same Epley the absolute path uses: 80 × (1 + 5/30)
    assert estimate == 80.0 * (1 + 5 / 30)


def test_weighted_bodyweight_set_scores_mass_plus_added_load():
    # Arrange — bodyweight + 20 kg for 5 reps at a captured mass of 80 kg
    load = _bodyweight(20.0)

    # Act — resolves to 100 kg-equivalent, then Epley
    estimate = estimated_1rm_for_set(load, 5, body_weight_kg=80.0)

    # Assert
    assert estimate == 100.0 * (1 + 5 / 30)


def test_bodyweight_set_without_a_captured_mass_scores_nothing():
    # Arrange — a bodyweight set logged when no Performed Body Weight was on file
    load = _bodyweight()

    # Act
    estimate = estimated_1rm_for_set(load, 5, body_weight_kg=None)

    # Assert — no mass, so no comparable figure (never guessed)
    assert estimate is None


def test_bodyweight_set_outside_the_rep_window_scores_nothing():
    # Arrange — a 13-rep bodyweight set with a captured mass: past the trustworthy window
    load = _bodyweight()

    # Act
    estimate = estimated_1rm_for_set(load, 13, body_weight_kg=80.0)

    # Assert — high-rep endurance work stays intentionally unscored, mass or not
    assert estimate is None


def test_absolute_scoring_is_unchanged_by_the_new_body_weight_argument():
    # Arrange — an absolute load; the Performed Body Weight is irrelevant to it
    load = _absolute(100.0)

    # Act — with and without a mass argument
    without = estimated_1rm_for_set(load, 1)
    with_mass = estimated_1rm_for_set(load, 1, body_weight_kg=80.0)

    # Assert — an absolute single is its own 1RM, mass never enters
    assert without == 100.0
    assert with_mass == 100.0


# --- detect_personal_records: bodyweight records (ADR-0026) ---


def _bw_set(exercise_id, name, reps, performed_on, *, added_kg=None, body_weight_kg=None):
    return LoggedSetRecord(
        exercise_id=exercise_id,
        exercise_name=name,
        reps=reps,
        load=_bodyweight(added_kg),
        performed_on=performed_on,
        body_weight_kg=body_weight_kg,
    )


def test_a_pure_bodyweight_set_with_a_captured_mass_sets_a_record():
    # Arrange — 8 pull-ups at a captured mass of 75 kg, in the trustworthy window
    history = [_bw_set(PRESS, "Pull-up", 8, date(2026, 6, 1), body_weight_kg=75.0)]

    # Act
    records = detect_personal_records(history)

    # Assert — it records, carrying the set that achieved it (reps, bodyweight, no added)
    assert len(records) == 1
    pr = records[0]
    assert pr.estimated_1rm == 75.0 * (1 + 8 / 30)
    assert pr.reps == 8
    assert pr.is_bodyweight is True
    assert pr.added_kg is None


def test_more_reps_at_a_fixed_mass_beats_the_prior_bodyweight_record():
    # Arrange — 5 then 8 pull-ups at the same 75 kg captured mass
    history = [
        _bw_set(PRESS, "Pull-up", 5, date(2026, 6, 1), body_weight_kg=75.0),
        _bw_set(PRESS, "Pull-up", 8, date(2026, 6, 8), body_weight_kg=75.0),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — the higher-rep set at fixed mass sets a new record over the first
    assert len(records) == 2
    assert records[1].reps == 8
    assert records[1].gain > 0


def test_a_weighted_bodyweight_set_can_beat_a_pure_bodyweight_record():
    # Arrange — 8 pull-ups, then bodyweight + 20 kg × 5, same 75 kg mass
    history = [
        _bw_set(PRESS, "Pull-up", 8, date(2026, 6, 1), body_weight_kg=75.0),
        _bw_set(PRESS, "Pull-up", 5, date(2026, 6, 8), added_kg=20.0, body_weight_kg=75.0),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — the belted set's higher kg-equivalent estimate outranks the pure record
    assert len(records) == 2
    assert records[1].is_bodyweight is True
    assert records[1].added_kg == 20.0


def test_a_bodyweight_set_with_no_mass_sets_no_record_and_does_not_reset_the_best():
    # Arrange — a real record, then a mass-less bodyweight set that should be ignored,
    # then a weaker set that must still be blocked by the standing record
    history = [
        _bw_set(PRESS, "Pull-up", 8, date(2026, 6, 1), body_weight_kg=75.0),
        _bw_set(PRESS, "Pull-up", 12, date(2026, 6, 8), body_weight_kg=None),
        _bw_set(PRESS, "Pull-up", 6, date(2026, 6, 15), body_weight_kg=75.0),
    ]

    # Act
    records = detect_personal_records(history)

    # Assert — only the first records; the mass-less set neither fires nor lowers the bar
    assert len(records) == 1
    assert records[0].performed_on == date(2026, 6, 1)


def test_a_bodyweight_record_does_not_drift_when_current_weight_changes():
    # Arrange — the same performance, scored against the snapshotted mass, is stable no
    # matter the user's later weight: detection reads only body_weight_kg on the record
    history = [_bw_set(PRESS, "Pull-up", 8, date(2026, 6, 1), body_weight_kg=75.0)]

    # Act — recomputing the identical history yields the identical estimate
    first = detect_personal_records(history)
    again = detect_personal_records(history)

    # Assert — a pure read-time projection over a snapshotted mass cannot drift
    assert first[0].estimated_1rm == again[0].estimated_1rm == 75.0 * (1 + 8 / 30)


def test_a_high_rep_bodyweight_set_never_sets_a_record():
    # Arrange — 20 push-ups at a captured mass: past the trustworthy window
    history = [_bw_set(PRESS, "Push-up", 20, date(2026, 6, 1), body_weight_kg=80.0)]

    # Act
    records = detect_personal_records(history)

    # Assert — high-rep endurance work stays unscored, mass or not
    assert records == []
