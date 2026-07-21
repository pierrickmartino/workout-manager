"""Shared Top-Set read helper — the per-session Top Set both Exercise Detail and
Strength Analytics read through (issue #177). ``top_set_series`` projects a Logged-Session
history onto one Exercise's oldest-first trajectory of Top Sets (the best Estimated 1RM
per qualifying session), capped to the most recent ``TOP_SET_SERIES_LIMIT``, with no
zero-padding for a session that holds no scorable set — absolute, or bodyweight resolved
against its Performed Body Weight — in the trustworthy rep window.
It reuses the same one-yardstick set qualifier (``estimated_1rm_for_set``) as the Personal
Record tile, so "the Top Set" means one thing everywhere. Pure over the repository view.
"""

from __future__ import annotations

from datetime import date

from app.domain.load import LoadKind, ParsedLoad
from app.logbook.top_sets import TOP_SET_SERIES_LIMIT, TopSetPoint, top_set_series
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)

SQUAT = 1
PRESS = 2


def _abs(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _bw(added_kg: float | None = None) -> dict:
    """The stored typed-Load dict for a bodyweight load, pure or with added kg."""

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
        exercise_name="Back Squat" if exercise_id == SQUAT else "Overhead Press",
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


def test_top_set_series_is_the_best_estimated_1rm_per_session_oldest_first():
    # Arrange — two performances; each session's best Est. 1RM is the top set, later heavier
    history = [
        _session(date(2026, 1, 8), [_set(SQUAT, 1, _abs(120.0))]),
        _session(
            date(2026, 1, 1),
            [_set(SQUAT, 1, _abs(100.0)), _set(SQUAT, 1, _abs(110.0))],
        ),
    ]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — one point per session, oldest-first, each the session's best Est. 1RM
    assert series == [
        TopSetPoint(performed_on=date(2026, 1, 1), estimated_1rm=110.0),
        TopSetPoint(performed_on=date(2026, 1, 8), estimated_1rm=120.0),
    ]


def test_top_set_series_omits_non_qualifying_sessions_with_no_zero_padding():
    # Arrange — three sessions, but the middle one holds only a bodyweight set
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    history = [
        _session(date(2026, 1, 1), [_set(SQUAT, 1, _abs(100.0))]),
        _session(date(2026, 1, 8), [_set(SQUAT, 5, bodyweight)]),
        _session(date(2026, 1, 15), [_set(SQUAT, 1, _abs(105.0))]),
    ]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — only the two qualifying sessions contribute; no gap point for the middle
    assert [(p.performed_on, p.estimated_1rm) for p in series] == [
        (date(2026, 1, 1), 100.0),
        (date(2026, 1, 15), 105.0),
    ]


def test_top_set_series_caps_at_the_last_qualifying_sessions():
    # Arrange — one more than the cap, one qualifying session per day, increasing
    count = TOP_SET_SERIES_LIMIT + 2
    history = [
        _session(date(2026, 1, day), [_set(SQUAT, 1, _abs(100.0 + day))])
        for day in range(1, count + 1)
    ]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — only the most recent TOP_SET_SERIES_LIMIT, still oldest-first
    assert len(series) == TOP_SET_SERIES_LIMIT
    assert [p.performed_on for p in series] == [
        date(2026, 1, day) for day in range(3, count + 1)
    ]


def test_only_the_requested_exercises_sets_contribute():
    # Arrange — one session mixes a squat and a heavier press
    history = [
        _session(
            date(2026, 1, 1),
            [_set(SQUAT, 1, _abs(100.0)), _set(PRESS, 1, _abs(200.0))],
        )
    ]

    # Act — ask only about the squat
    series = top_set_series(history, SQUAT)

    # Assert — the press's heavier set never bleeds into the squat's trajectory
    assert series == [TopSetPoint(performed_on=date(2026, 1, 1), estimated_1rm=100.0)]


def test_top_set_series_scores_a_bodyweight_session_against_its_performed_body_weight():
    # Arrange — one bodyweight + 20 kg pull-up set at 5 reps, performed at 80 kg body weight
    history = [_session(date(2026, 1, 1), [_set(SQUAT, 5, _bw(20.0), body_weight_kg=80.0)])]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — resolves to 100 kg-equivalent and scores via the shared Epley yardstick
    assert series == [
        TopSetPoint(performed_on=date(2026, 1, 1), estimated_1rm=100.0 * (1 + 5 / 30))
    ]


def test_top_set_series_excludes_bodyweight_sets_above_the_rep_window():
    # Arrange — a high-rep (13) bodyweight set is honest endurance work, not a strength max
    history = [_session(date(2026, 1, 1), [_set(SQUAT, 13, _bw(), body_weight_kg=80.0)])]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — no Top Set point; the session is simply absent (no zero-padding)
    assert series == []


def test_top_set_series_excludes_bodyweight_sets_with_no_performed_body_weight():
    # Arrange — a bodyweight set with no captured mass cannot be resolved to a strength figure
    history = [_session(date(2026, 1, 1), [_set(SQUAT, 5, _bw(), body_weight_kg=None)])]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — the honest empty trend, not a fabricated point
    assert series == []


def test_top_set_series_rises_when_reps_climb_at_fixed_body_weight():
    # Arrange — same movement and body weight, more reps in the later session
    history = [
        _session(date(2026, 1, 1), [_set(SQUAT, 5, _bw(), body_weight_kg=80.0)]),
        _session(date(2026, 1, 8), [_set(SQUAT, 10, _bw(), body_weight_kg=80.0)]),
    ]

    # Act
    series = top_set_series(history, SQUAT)

    # Assert — reps climbing at fixed mass reads as progress: the trajectory moves up
    assert [p.performed_on for p in series] == [date(2026, 1, 1), date(2026, 1, 8)]
    assert series[1].estimated_1rm > series[0].estimated_1rm
