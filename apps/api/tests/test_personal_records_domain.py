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
from app.domain.personal_records import LoggedSetRecord, detect_personal_records

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
