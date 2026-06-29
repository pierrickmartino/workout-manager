"""The self-paced program view (ADR-0001): surface the next un-performed Session.

A Program is followed as an ordered sequence with no calendar binding — the "next"
Session is simply the first one (by position) the user has not yet logged a
performance of. Missing days just means picking up where they left off. Exercised
with in-memory repositories; logging reuses the existing record-side repository."""

from __future__ import annotations

from datetime import date

from app.adoption.service import adopt
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)
from app.programs.progress import program_progress
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
)
from app.repositories.program_repository import InMemoryProgramRepository
from app.repositories.session_repository import InMemorySessionRepository


PARAMS = ProgramGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=3,
    equipment=[],
)


def _three_week_program() -> GeneratedProgram:
    return GeneratedProgram(
        sessions=[
            GeneratedProgramSession(
                week=week,
                day=1,
                title=f"Week {week}",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat", sets=5, reps="5"
                    )
                ],
            )
            for week in (1, 2, 3)
        ]
    )


def _build():
    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, programs, logged


def _perform(logged, user, session_id):
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id, performed_on=date(2026, 1, 1), logged_sets=[]
        ),
    )


def test_next_session_is_the_first_one_for_a_brand_new_program():
    # Arrange
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_new", PARAMS,
                 exercises=exercises, programs=programs)

    # Act
    progress = program_progress("user_new", view.id, programs=programs, logged=logged)

    # Assert — nothing performed yet → the Week-1 Session is next
    assert progress.next_session is not None
    assert progress.next_session.week == 1
    assert progress.completed_count == 0


def test_next_session_advances_past_performed_sessions():
    # Arrange — perform Week 1
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_adv", PARAMS,
                 exercises=exercises, programs=programs)
    _perform(logged, "user_adv", view.sessions[0].session_id)

    # Act
    progress = program_progress("user_adv", view.id, programs=programs, logged=logged)

    # Assert — Week-2 is now next; Week-1 counts as completed
    assert progress.next_session.week == 2
    assert progress.completed_count == 1


def test_a_missed_session_does_not_skip_ahead_self_paced():
    # Arrange — perform only Week 1; Week 2 is "missed" but not skipped
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_miss", PARAMS,
                 exercises=exercises, programs=programs)
    _perform(logged, "user_miss", view.sessions[0].session_id)

    # Act
    progress = program_progress("user_miss", view.id, programs=programs, logged=logged)

    # Assert — picks up at Week 2, not Week 3 (no calendar binding)
    assert progress.next_session.week == 2


def test_next_session_is_none_once_every_session_is_performed():
    # Arrange — perform all three weeks
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_done", PARAMS,
                 exercises=exercises, programs=programs)
    for session in view.sessions:
        _perform(logged, "user_done", session.session_id)

    # Act
    progress = program_progress("user_done", view.id, programs=programs, logged=logged)

    # Assert — the Program is finished
    assert progress.next_session is None
    assert progress.completed_count == 3


def test_progress_is_none_for_a_program_not_owned_by_the_user():
    # Arrange
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_owner", PARAMS,
                 exercises=exercises, programs=programs)

    # Act / Assert — another user cannot view the program's progress
    assert program_progress(
        "user_intruder", view.id, programs=programs, logged=logged
    ) is None


def test_another_users_logs_do_not_advance_my_program():
    # Arrange — only the owner's performances count toward "next"
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_me", PARAMS,
                 exercises=exercises, programs=programs)
    _perform(logged, "someone_else", view.sessions[0].session_id)

    # Act
    progress = program_progress("user_me", view.id, programs=programs, logged=logged)

    # Assert — my Week-1 is still next
    assert progress.next_session.week == 1
    assert progress.completed_count == 0
