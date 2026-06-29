"""The per-exercise progress view (Slice 12): a chronological time series of what
the user actually performed for one Exercise, drawn from the *record* side.

``exercise_progress`` reads the user's Logged Sessions and filters to a single
Exercise, returning one point per performance date with the Logged Sets done that
day (reps, load, perceived difficulty). It is read-only over the record side — no
plan is touched, no AI runs — and is scoped to the owning user. Points are ordered
oldest-first so a chart of progress reads left-to-right in time. Exercised with
the in-memory Logged-Session repository."""

from __future__ import annotations

from datetime import date

from app.domain.exercise import Provenance
from app.logbook.progress import exercise_progress
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)


SQUAT = 1
PRESS = 2


def _build():
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    exercises.find_or_create("Overhead Press", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, sessions, logged


def _session(sessions, user) -> int:
    view = sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[],
        ),
    )
    return view.id


def _log(logged, user, session_id, performed_on, sets):
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=performed_on,
            logged_sets=sets,
        ),
    )


def test_one_performance_of_an_exercise_becomes_one_progress_point():
    # Arrange — the user logs a single squat performance
    _, sessions, logged = _build()
    session_id = _session(sessions, "user_a")
    _log(
        logged,
        "user_a",
        session_id,
        date(2026, 1, 1),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5, load="100kg", perceived_difficulty=7)],
    )

    # Act
    progress = exercise_progress("user_a", SQUAT, logged=logged)

    # Assert — one point on that date, carrying the set performed
    assert progress.exercise_id == SQUAT
    assert progress.exercise_name == "Back Squat"
    assert len(progress.points) == 1
    point = progress.points[0]
    assert point.performed_on == date(2026, 1, 1)
    assert [s.reps for s in point.sets] == [5]
    assert point.sets[0].load == "100kg"
    assert point.sets[0].perceived_difficulty == 7


def test_performances_are_ordered_oldest_first_for_a_left_to_right_chart():
    # Arrange — three squat performances logged out of date order
    _, sessions, logged = _build()
    s1 = _session(sessions, "user_b")
    s2 = _session(sessions, "user_b")
    s3 = _session(sessions, "user_b")
    _log(logged, "user_b", s2, date(2026, 2, 1),
         [LoggedSetDraft(exercise_id=SQUAT, reps=5, load="105kg")])
    _log(logged, "user_b", s1, date(2026, 1, 1),
         [LoggedSetDraft(exercise_id=SQUAT, reps=5, load="100kg")])
    _log(logged, "user_b", s3, date(2026, 3, 1),
         [LoggedSetDraft(exercise_id=SQUAT, reps=5, load="110kg")])

    # Act
    progress = exercise_progress("user_b", SQUAT, logged=logged)

    # Assert — chronological: Jan, Feb, Mar
    assert [p.performed_on for p in progress.points] == [
        date(2026, 1, 1),
        date(2026, 2, 1),
        date(2026, 3, 1),
    ]
    assert [p.sets[0].load for p in progress.points] == ["100kg", "105kg", "110kg"]


def test_only_the_requested_exercise_contributes_points_and_sets():
    # Arrange — one session mixes squats and presses; another is presses only
    _, sessions, logged = _build()
    mixed = _session(sessions, "user_c")
    press_only = _session(sessions, "user_c")
    _log(logged, "user_c", mixed, date(2026, 1, 1), [
        LoggedSetDraft(exercise_id=SQUAT, reps=5, load="100kg"),
        LoggedSetDraft(exercise_id=PRESS, reps=8, load="40kg"),
    ])
    _log(logged, "user_c", press_only, date(2026, 1, 2), [
        LoggedSetDraft(exercise_id=PRESS, reps=8, load="42kg"),
    ])

    # Act
    progress = exercise_progress("user_c", SQUAT, logged=logged)

    # Assert — only the squat session is a point, and only its squat set is kept
    assert len(progress.points) == 1
    assert progress.points[0].performed_on == date(2026, 1, 1)
    assert [s.exercise_id for s in progress.points[0].sets] == [SQUAT]


def test_multiple_sets_of_the_exercise_in_one_session_group_under_one_point():
    # Arrange — three working sets of squats in a single performance
    _, sessions, logged = _build()
    session_id = _session(sessions, "user_d")
    _log(logged, "user_d", session_id, date(2026, 1, 1), [
        LoggedSetDraft(exercise_id=SQUAT, reps=5, load="100kg"),
        LoggedSetDraft(exercise_id=SQUAT, reps=5, load="100kg"),
        LoggedSetDraft(exercise_id=SQUAT, reps=4, load="100kg"),
    ])

    # Act
    progress = exercise_progress("user_d", SQUAT, logged=logged)

    # Assert — one date, three sets under it
    assert len(progress.points) == 1
    assert [s.reps for s in progress.points[0].sets] == [5, 5, 4]


def test_progress_is_empty_when_the_exercise_was_never_performed():
    # Arrange — the user logged presses, never squats
    _, sessions, logged = _build()
    session_id = _session(sessions, "user_e")
    _log(logged, "user_e", session_id, date(2026, 1, 1),
         [LoggedSetDraft(exercise_id=PRESS, reps=8, load="40kg")])

    # Act
    progress = exercise_progress("user_e", SQUAT, logged=logged)

    # Assert — no points, and no name to surface
    assert progress.points == []
    assert progress.exercise_name == ""


def test_another_users_performances_do_not_appear_in_my_progress():
    # Arrange — only the owner's logs count
    _, sessions, logged = _build()
    mine = _session(sessions, "user_me")
    theirs = _session(sessions, "user_them")
    _log(logged, "user_them", theirs, date(2026, 1, 1),
         [LoggedSetDraft(exercise_id=SQUAT, reps=5, load="200kg")])
    _log(logged, "user_me", mine, date(2026, 1, 2),
         [LoggedSetDraft(exercise_id=SQUAT, reps=5, load="100kg")])

    # Act
    progress = exercise_progress("user_me", SQUAT, logged=logged)

    # Assert — I see only my own performance
    assert len(progress.points) == 1
    assert progress.points[0].sets[0].load == "100kg"
