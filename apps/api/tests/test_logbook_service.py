"""Behavior of the logbook service: recording a performance of a Session.

``log_session`` is the orchestration that guards the record side — you may only
log a performance of *your own* Session, and every logged set must reference a
real catalog Exercise — before persisting it. Tested through its public function
over in-memory repositories; no AI and no database."""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.exercise import Provenance
from app.logbook.service import (
    LogSessionRequest,
    SessionNotOwnedError,
    UnknownExerciseError,
    log_session,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)


def _wire():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return sessions, exercises, logged


def _owned_session(sessions, exercises, owner="user_owner"):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    session_view = sessions.create(
        owner,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
        ),
    )
    return session_view, squat


def test_log_session_records_a_performance_for_the_owner():
    # Arrange
    sessions, exercises, logged = _wire()
    session_view, squat = _owned_session(sessions, exercises)
    request = LogSessionRequest(
        session_id=session_view.id,
        performed_on=date(2026, 6, 20),
        logged_sets=[
            LoggedSetDraft(
                exercise_id=squat.id, reps=5, load="70kg", perceived_difficulty=8
            )
        ],
    )

    # Act
    view = log_session(
        request, "user_owner", sessions=sessions, exercises=exercises, logged=logged
    )

    # Assert
    assert view.session_id == session_view.id
    assert view.performed_on == date(2026, 6, 20)
    assert view.logged_sets[0].reps == 5
    assert logged.get(view.id, "user_owner") is not None


def test_log_session_rejects_logging_another_users_session():
    # Arrange — the Session belongs to user_owner
    sessions, exercises, logged = _wire()
    session_view, squat = _owned_session(sessions, exercises)
    request = LogSessionRequest(
        session_id=session_view.id,
        performed_on=date(2026, 6, 20),
        logged_sets=[LoggedSetDraft(exercise_id=squat.id, reps=5)],
    )

    # Act / Assert — a different user may not log it, and nothing is persisted
    with pytest.raises(SessionNotOwnedError):
        log_session(
            request,
            "user_intruder",
            sessions=sessions,
            exercises=exercises,
            logged=logged,
        )
    assert logged.list_for_user("user_intruder") == []


def test_log_session_rejects_an_unknown_exercise():
    # Arrange — a logged set references an exercise id that is not in the catalog
    sessions, exercises, logged = _wire()
    session_view, _ = _owned_session(sessions, exercises)
    request = LogSessionRequest(
        session_id=session_view.id,
        performed_on=date(2026, 6, 20),
        logged_sets=[LoggedSetDraft(exercise_id=9999, reps=5)],
    )

    # Act / Assert
    with pytest.raises(UnknownExerciseError):
        log_session(
            request, "user_owner", sessions=sessions, exercises=exercises, logged=logged
        )
    assert logged.list_for_user("user_owner") == []
