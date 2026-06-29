"""Behavior of the program-view Progression overlay (Slice 8, ADR-0004).

``progressed_program`` is the read-side join of a user-owned Program to the user's
Logged Sets: it surfaces the self-paced next Session (like ``program_progress``)
*and* overlays each upcoming Prescription's recommended load with the deterministic
``next_load`` adjustment. Already-performed Sessions are history and stay as logged;
the stored Program — and therefore any cached/Generated source — is never mutated.
Exercised with in-memory repositories."""

from __future__ import annotations

from datetime import date

from app.adoption.service import adopt
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)
from app.programs.progress import progressed_program
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
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
                        exercise_name="Back Squat",
                        sets=3,
                        reps="5",
                        recommended_load="60 kg",
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


def _log_week_one(logged, user, view, *, reps, effort):
    """Log Week 1's Back Squat as performed with the given reps/effort per set."""

    week_one = view.sessions[0]
    exercise_id = week_one.prescriptions[0].exercise_id
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=week_one.session_id,
            performed_on=date(2026, 1, 1),
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=exercise_id,
                    reps=reps,
                    load="60 kg",
                    perceived_difficulty=effort,
                )
                for _ in range(3)
            ],
        ),
    )


def test_strong_logged_sets_raise_the_load_on_upcoming_sessions():
    # Arrange — perform Week 1 with all reps hit at low effort
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_strong", PARAMS,
                 exercises=exercises, programs=programs)
    _log_week_one(logged, "user_strong", view, reps=5, effort=6)

    # Act
    progress = progressed_program(
        "user_strong", view.id, programs=programs, logged=logged
    )

    # Assert — Weeks 2 & 3 (upcoming) carry the raised recommendation
    upcoming = progress.program.sessions[1:]
    assert [s.prescriptions[0].recommended_load for s in upcoming] == [
        "62.5 kg",
        "62.5 kg",
    ]
    assert progress.next_session.week == 2
    assert progress.next_session.prescriptions[0].recommended_load == "62.5 kg"


def test_missed_reps_reduce_the_load_on_upcoming_sessions():
    # Arrange — perform Week 1 but fall short of the prescribed reps
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_missed", PARAMS,
                 exercises=exercises, programs=programs)
    _log_week_one(logged, "user_missed", view, reps=3, effort=9)

    # Act
    progress = progressed_program(
        "user_missed", view.id, programs=programs, logged=logged
    )

    # Assert
    assert progress.next_session.prescriptions[0].recommended_load == "55 kg"


def test_already_performed_sessions_keep_their_logged_load():
    # Arrange
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_hist", PARAMS,
                 exercises=exercises, programs=programs)
    _log_week_one(logged, "user_hist", view, reps=5, effort=6)

    # Act
    progress = progressed_program(
        "user_hist", view.id, programs=programs, logged=logged
    )

    # Assert — Week 1 is history; its recommendation is untouched
    assert progress.program.sessions[0].prescriptions[0].recommended_load == "60 kg"


def test_no_logged_sets_leaves_every_load_unchanged():
    # Arrange — a brand-new program, nothing performed
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_fresh", PARAMS,
                 exercises=exercises, programs=programs)

    # Act
    progress = progressed_program(
        "user_fresh", view.id, programs=programs, logged=logged
    )

    # Assert
    loads = [s.prescriptions[0].recommended_load for s in progress.program.sessions]
    assert loads == ["60 kg", "60 kg", "60 kg"]


def test_overlay_does_not_mutate_the_stored_program():
    # Arrange — strong performance would raise the recommendation
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_iso", PARAMS,
                 exercises=exercises, programs=programs)
    _log_week_one(logged, "user_iso", view, reps=5, effort=6)

    # Act — read it twice through the overlay
    progressed_program("user_iso", view.id, programs=programs, logged=logged)

    # Assert — the stored Program is unchanged; the overlay is a read-time view
    stored = programs.get(view.id, "user_iso")
    loads = [s.prescriptions[0].recommended_load for s in stored.sessions]
    assert loads == ["60 kg", "60 kg", "60 kg"]


def test_overlay_is_none_for_a_program_not_owned_by_the_user():
    # Arrange
    exercises, programs, logged = _build()
    view = adopt(_three_week_program(), "user_owner", PARAMS,
                 exercises=exercises, programs=programs)

    # Act / Assert
    assert progressed_program(
        "user_intruder", view.id, programs=programs, logged=logged
    ) is None
