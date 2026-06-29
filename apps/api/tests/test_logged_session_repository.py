"""Behavior of the LoggedSession repository through its public interface, over
both the in-memory fake and the real SQLModel implementation.

A Logged Session is the *record* of performing a user-owned Session on a date:
it carries ordered Logged Sets (real reps, load, perceived difficulty) and never
mutates the prescribing Session. Reads are scoped to the owning user and return
plain views joined to each set's catalog Exercise and the parent Session's
training type — consumers never touch the ORM."""

from __future__ import annotations

from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
    SqlLoggedSessionRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
    SqlSessionRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    """Yield (logged_repo, session_repo, exercise_repo) sharing one backing store."""
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        sessions = InMemorySessionRepository(exercises)
        yield InMemoryLoggedSessionRepository(sessions, exercises), sessions, exercises
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield (
            SqlLoggedSessionRepository(session),
            SqlSessionRepository(session),
            SqlExerciseRepository(session),
        )


def _session_with_two_exercises(sessions, exercises):
    """Persist a user-owned Session and return (session_view, squat, press)."""
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create(
        "Overhead Press", provenance=Provenance.AI_GENERATED
    )
    session_view = sessions.create(
        "user_owner",
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5"),
                PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
            ],
        ),
    )
    return session_view, squat, press


def _log_draft(session_id, squat, press) -> LoggedSessionDraft:
    return LoggedSessionDraft(
        session_id=session_id,
        performed_on=date(2026, 6, 20),
        logged_sets=[
            LoggedSetDraft(
                exercise_id=squat.id, reps=5, load="70kg", perceived_difficulty=8
            ),
            LoggedSetDraft(
                exercise_id=press.id, reps=10, load="30kg", perceived_difficulty=6
            ),
        ],
    )


def test_logged_session_round_trips_with_its_sets(repos):
    # Arrange
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    view = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Assert
    assert view.id is not None
    assert view.clerk_user_id == "user_owner"
    assert view.session_id == session_view.id
    assert view.performed_on == date(2026, 6, 20)
    assert [s.reps for s in view.logged_sets] == [5, 10]
    assert [s.load for s in view.logged_sets] == ["70kg", "30kg"]
    assert [s.perceived_difficulty for s in view.logged_sets] == [8, 6]
    assert [s.exercise_name for s in view.logged_sets] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert view.training_type == "strength"


def test_same_session_can_be_logged_multiple_times_separately(repos):
    # Arrange — one Session, performed on two different dates
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)

    # Act
    first = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 20),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, reps=5, load="70kg")],
        ),
    )
    second = logged.create(
        "user_owner",
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=date(2026, 6, 27),
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, reps=6, load="72kg")],
        ),
    )

    # Assert — each performance is its own record, both tied to the same Session
    assert first.id != second.id
    assert first.session_id == second.session_id == session_view.id
    assert logged.get(first.id, "user_owner").logged_sets[0].reps == 5
    assert logged.get(second.id, "user_owner").logged_sets[0].reps == 6


def test_get_does_not_leak_another_users_log(repos):
    # Arrange — a Logged Session is user-owned; another user must not read it
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    created = logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act
    fetched = logged.get(created.id, "user_intruder")

    # Assert
    assert fetched is None


def test_get_returns_none_for_an_unknown_log(repos):
    # Arrange
    logged, _, _ = repos

    # Assert
    assert logged.get(987654, "user_any") is None


def test_history_lists_users_logs_newest_first(repos):
    # Arrange — three performances on ascending dates
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    for performed_on in (date(2026, 6, 1), date(2026, 6, 15), date(2026, 6, 10)):
        logged.create(
            "user_owner",
            LoggedSessionDraft(
                session_id=session_view.id,
                performed_on=performed_on,
                logged_sets=[LoggedSetDraft(exercise_id=squat.id, reps=5)],
            ),
        )

    # Act
    history = logged.list_for_user("user_owner")

    # Assert — most recent performance first
    assert [entry.performed_on for entry in history] == [
        date(2026, 6, 15),
        date(2026, 6, 10),
        date(2026, 6, 1),
    ]


def test_history_is_scoped_to_the_user(repos):
    # Arrange — two users each log against their own session
    logged, sessions, exercises = repos
    session_view, squat, press = _session_with_two_exercises(sessions, exercises)
    logged.create("user_owner", _log_draft(session_view.id, squat, press))

    # Act / Assert — a different user sees an empty history
    assert logged.list_for_user("user_other") == []
