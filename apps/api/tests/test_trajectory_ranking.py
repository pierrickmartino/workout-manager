"""Ranked strength trajectories (issue #177): ``rank_qualifying_exercises`` picks the
user's most-trained *qualifying* Exercises — those with at least one absolute-Load set in
the trustworthy 1–12-rep window — and returns each with its oldest-first Top-Set series,
ordered by recent training frequency (most qualifying sessions first, most-recent training
breaking ties), capped to a small number so the screen shows small-multiples, not a wall.
Pure over the repository view — no ORM, no HTTP."""

from __future__ import annotations

from datetime import date

from app.domain.load import LoadKind, ParsedLoad
from app.logbook.top_sets import (
    TOP_SET_SERIES_LIMIT,
    ExerciseTrajectory,
    TopSetPoint,
    rank_qualifying_exercises,
)
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)

SQUAT = 1
PRESS = 2
DEADLIFT = 3
NAMES = {SQUAT: "Back Squat", PRESS: "Overhead Press", DEADLIFT: "Deadlift"}


def _abs(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _bw(added_kg: float | None = None) -> dict:
    text = "bodyweight" if added_kg is None else f"bodyweight + {added_kg:g} kg"
    return ParsedLoad(
        kind=LoadKind.BODYWEIGHT, text=text, added_kg=added_kg
    ).to_dict()


def _set(
    exercise_id: int,
    reps: int,
    load: dict,
    body_weight_kg: float | None = None,
) -> LoggedSetView:
    return LoggedSetView(
        position=0,
        reps=reps,
        load=load,
        perceived_difficulty=None,
        exercise_id=exercise_id,
        exercise_name=NAMES[exercise_id],
        body_weight_kg=body_weight_kg,
    )


def _session(performed_on: date, sets: list[LoggedSetView]) -> LoggedSessionView:
    return LoggedSessionView(
        id=0,
        clerk_user_id="user",
        session_id=0,
        training_type="strength",
        performed_on=performed_on,
        logged_sets=sets,
    )


def test_ranks_qualifying_exercises_by_frequency_each_with_its_oldest_first_series():
    # Arrange — the squat is trained in two sessions, the press in one
    history = [
        _session(
            date(2026, 1, 1), [_set(SQUAT, 1, _abs(100.0)), _set(PRESS, 1, _abs(60.0))]
        ),
        _session(date(2026, 1, 8), [_set(SQUAT, 1, _abs(110.0))]),
    ]

    # Act
    ranked = rank_qualifying_exercises(history)

    # Assert — the more-frequently trained squat leads, each carrying its trajectory
    assert ranked == [
        ExerciseTrajectory(
            exercise_id=SQUAT,
            exercise_name="Back Squat",
            series=[
                TopSetPoint(date(2026, 1, 1), 100.0),
                TopSetPoint(date(2026, 1, 8), 110.0),
            ],
        ),
        ExerciseTrajectory(
            exercise_id=PRESS,
            exercise_name="Overhead Press",
            series=[TopSetPoint(date(2026, 1, 1), 60.0)],
        ),
    ]


def test_most_recently_trained_breaks_a_frequency_tie():
    # Arrange — squat and press each trained once, but the press is the fresher session
    history = [
        _session(date(2026, 1, 1), [_set(SQUAT, 1, _abs(100.0))]),
        _session(date(2026, 1, 20), [_set(PRESS, 1, _abs(60.0))]),
    ]

    # Act
    ranked = rank_qualifying_exercises(history)

    # Assert — equal frequency, so the more recently trained press leads
    assert [t.exercise_id for t in ranked] == [PRESS, SQUAT]


def test_excludes_exercises_with_no_qualifying_set():
    # Arrange — the squat qualifies; the press is bodyweight-only, the deadlift high-rep
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    history = [
        _session(
            date(2026, 1, 1),
            [
                _set(SQUAT, 1, _abs(100.0)),
                _set(PRESS, 10, bodyweight),
                _set(DEADLIFT, 20, _abs(140.0)),  # reps outside the trustworthy window
            ],
        ),
    ]

    # Act
    ranked = rank_qualifying_exercises(history)

    # Assert — only the qualifying squat has a trajectory
    assert [t.exercise_id for t in ranked] == [SQUAT]


def test_caps_the_number_of_trajectories_and_the_cap_is_configurable():
    # Arrange — three qualifying exercises, each trained a distinct number of times so the
    # frequency order is unambiguous (squat 3, press 2, deadlift 1)
    history = [
        _session(
            date(2026, 1, 1),
            [
                _set(SQUAT, 1, _abs(100.0)),
                _set(PRESS, 1, _abs(60.0)),
                _set(DEADLIFT, 1, _abs(140.0)),
            ],
        ),
        _session(
            date(2026, 1, 8), [_set(SQUAT, 1, _abs(101.0)), _set(PRESS, 1, _abs(61.0))]
        ),
        _session(date(2026, 1, 15), [_set(SQUAT, 1, _abs(102.0))]),
    ]

    # Act — keep only the top two by frequency
    ranked = rank_qualifying_exercises(history, cap=2)

    # Assert — the deadlift (least frequent) falls off the cap
    assert [t.exercise_id for t in ranked] == [SQUAT, PRESS]


def test_each_trajectory_series_is_capped_to_the_recent_sessions():
    # Arrange — one more qualifying squat session than the series cap allows
    count = TOP_SET_SERIES_LIMIT + 2
    history = [
        _session(date(2026, 1, day), [_set(SQUAT, 1, _abs(100.0 + day))])
        for day in range(1, count + 1)
    ]

    # Act
    ranked = rank_qualifying_exercises(history)

    # Assert — the displayed trajectory is only the recent tail, oldest-first
    assert len(ranked) == 1
    assert len(ranked[0].series) == TOP_SET_SERIES_LIMIT
    assert ranked[0].series[0].performed_on == date(2026, 1, 3)


def test_includes_a_bodyweight_exercise_with_qualifying_sessions():
    # Arrange — the press is pure bodyweight, scored against a captured mass, in-window
    history = [
        _session(date(2026, 1, 1), [_set(PRESS, 5, _bw(), body_weight_kg=80.0)]),
        _session(date(2026, 1, 8), [_set(PRESS, 8, _bw(), body_weight_kg=80.0)]),
    ]

    # Act
    ranked = rank_qualifying_exercises(history)

    # Assert — the bodyweight Exercise earns a small-multiple, drawn on the shared yardstick
    assert [t.exercise_id for t in ranked] == [PRESS]
    series = ranked[0].series
    assert [p.performed_on for p in series] == [date(2026, 1, 1), date(2026, 1, 8)]
    assert series[1].estimated_1rm > series[0].estimated_1rm


def test_empty_history_yields_no_trajectories():
    assert rank_qualifying_exercises([]) == []
