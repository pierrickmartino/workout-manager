"""Behavior of the protocol-view Progression overlay (Slice 8, ADR-0004).

``progressed_protocol`` is the read-side join of a user-owned Protocol to the user's
Logged Sets: it surfaces the self-paced next Session (like ``protocol_progress``)
*and* overlays each upcoming Prescription's recommended load with the deterministic
``next_load`` adjustment. Already-performed Sessions are history and stay as logged;
the stored Protocol — and therefore any cached/Generated source — is never mutated.
Exercised with in-memory repositories."""

from __future__ import annotations

from datetime import date

from app.adoption.service import adopt
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.protocols.progress import progressed_protocol
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.protocol_repository import InMemoryProtocolRepository
from app.repositories.session_repository import InMemorySessionRepository


PARAMS = ProtocolGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=3,
    equipment=[],
)


def _three_week_protocol() -> GeneratedProtocol:
    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
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
    protocols = InMemoryProtocolRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, protocols, logged


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
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_strong", PARAMS,
                 exercises=exercises, protocols=protocols)
    _log_week_one(logged, "user_strong", view, reps=5, effort=6)

    # Act
    progress = progressed_protocol(
        "user_strong", view.id, protocols=protocols, logged=logged
    )

    # Assert — Weeks 2 & 3 (upcoming) carry the raised recommendation
    upcoming = progress.protocol.sessions[1:]
    assert [s.prescriptions[0].recommended_load for s in upcoming] == [
        "62.5 kg",
        "62.5 kg",
    ]
    assert progress.next_session.week == 2
    assert progress.next_session.prescriptions[0].recommended_load == "62.5 kg"


def test_missed_reps_reduce_the_load_on_upcoming_sessions():
    # Arrange — perform Week 1 but fall short of the prescribed reps
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_missed", PARAMS,
                 exercises=exercises, protocols=protocols)
    _log_week_one(logged, "user_missed", view, reps=3, effort=9)

    # Act
    progress = progressed_protocol(
        "user_missed", view.id, protocols=protocols, logged=logged
    )

    # Assert
    assert progress.next_session.prescriptions[0].recommended_load == "55 kg"


def test_already_performed_sessions_keep_their_logged_load():
    # Arrange
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_hist", PARAMS,
                 exercises=exercises, protocols=protocols)
    _log_week_one(logged, "user_hist", view, reps=5, effort=6)

    # Act
    progress = progressed_protocol(
        "user_hist", view.id, protocols=protocols, logged=logged
    )

    # Assert — Week 1 is history; its recommendation is untouched
    assert progress.protocol.sessions[0].prescriptions[0].recommended_load == "60 kg"


def test_no_logged_sets_leaves_every_load_unchanged():
    # Arrange — a brand-new protocol, nothing performed
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_fresh", PARAMS,
                 exercises=exercises, protocols=protocols)

    # Act
    progress = progressed_protocol(
        "user_fresh", view.id, protocols=protocols, logged=logged
    )

    # Assert
    loads = [s.prescriptions[0].recommended_load for s in progress.protocol.sessions]
    assert loads == ["60 kg", "60 kg", "60 kg"]


def test_overlay_does_not_mutate_the_stored_protocol():
    # Arrange — strong performance would raise the recommendation
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_iso", PARAMS,
                 exercises=exercises, protocols=protocols)
    _log_week_one(logged, "user_iso", view, reps=5, effort=6)

    # Act — read it twice through the overlay
    progressed_protocol("user_iso", view.id, protocols=protocols, logged=logged)

    # Assert — the stored Protocol is unchanged; the overlay is a read-time view
    stored = protocols.get(view.id, "user_iso")
    loads = [s.prescriptions[0].recommended_load for s in stored.sessions]
    assert loads == ["60 kg", "60 kg", "60 kg"]


def test_overlay_is_none_for_a_protocol_not_owned_by_the_user():
    # Arrange
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_owner", PARAMS,
                 exercises=exercises, protocols=protocols)

    # Act / Assert
    assert progressed_protocol(
        "user_intruder", view.id, protocols=protocols, logged=logged
    ) is None
