"""The self-paced protocol view (ADR-0001): surface the next un-performed Session.

A Protocol is followed as an ordered sequence with no calendar binding — the "next"
Session is simply the first one (by position) the user has not yet logged a
performance of. Missing days just means picking up where they left off. Exercised
with in-memory repositories; logging reuses the existing record-side repository."""

from __future__ import annotations

from datetime import date

from app.adoption.service import adopt
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.protocols.progress import current_protocol, protocol_progress
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
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
                        exercise_name="Back Squat", sets=5, reps="5"
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


def _perform(logged, user, session_id):
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id, performed_on=date(2026, 1, 1), logged_sets=[]
        ),
    )


def test_next_session_is_the_first_one_for_a_brand_new_protocol():
    # Arrange
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_new", PARAMS,
                 exercises=exercises, protocols=protocols)

    # Act
    progress = protocol_progress("user_new", view.id, protocols=protocols, logged=logged)

    # Assert — nothing performed yet → the Week-1 Session is next
    assert progress.next_session is not None
    assert progress.next_session.week == 1
    assert progress.completed_count == 0


def test_next_session_advances_past_performed_sessions():
    # Arrange — perform Week 1
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_adv", PARAMS,
                 exercises=exercises, protocols=protocols)
    _perform(logged, "user_adv", view.sessions[0].session_id)

    # Act
    progress = protocol_progress("user_adv", view.id, protocols=protocols, logged=logged)

    # Assert — Week-2 is now next; Week-1 counts as completed
    assert progress.next_session.week == 2
    assert progress.completed_count == 1


def test_a_missed_session_does_not_skip_ahead_self_paced():
    # Arrange — perform only Week 1; Week 2 is "missed" but not skipped
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_miss", PARAMS,
                 exercises=exercises, protocols=protocols)
    _perform(logged, "user_miss", view.sessions[0].session_id)

    # Act
    progress = protocol_progress("user_miss", view.id, protocols=protocols, logged=logged)

    # Assert — picks up at Week 2, not Week 3 (no calendar binding)
    assert progress.next_session.week == 2


def test_next_session_is_none_once_every_session_is_performed():
    # Arrange — perform all three weeks
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_done", PARAMS,
                 exercises=exercises, protocols=protocols)
    for session in view.sessions:
        _perform(logged, "user_done", session.session_id)

    # Act
    progress = protocol_progress("user_done", view.id, protocols=protocols, logged=logged)

    # Assert — the Protocol is finished
    assert progress.next_session is None
    assert progress.completed_count == 3


def test_progress_is_none_for_a_protocol_not_owned_by_the_user():
    # Arrange
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_owner", PARAMS,
                 exercises=exercises, protocols=protocols)

    # Act / Assert — another user cannot view the protocol's progress
    assert protocol_progress(
        "user_intruder", view.id, protocols=protocols, logged=logged
    ) is None


def test_another_users_logs_do_not_advance_my_protocol():
    # Arrange — only the owner's performances count toward "next"
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_me", PARAMS,
                 exercises=exercises, protocols=protocols)
    _perform(logged, "someone_else", view.sessions[0].session_id)

    # Act
    progress = protocol_progress("user_me", view.id, protocols=protocols, logged=logged)

    # Assert — my Week-1 is still next
    assert progress.next_session.week == 1
    assert progress.completed_count == 0


def test_current_protocol_is_the_only_in_progress_protocol():
    # Arrange — a single Protocol with nothing performed yet
    exercises, protocols, logged = _build()
    adopt(_three_week_protocol(), "user_one", PARAMS,
          exercises=exercises, protocols=protocols)

    # Act
    current = current_protocol("user_one", protocols=protocols, logged=logged)

    # Assert — it is the Current Protocol, with its next Session surfaced
    assert current is not None
    assert current.next_session.week == 1


def test_current_protocol_picks_the_most_recently_adopted_in_progress():
    # Arrange — two Protocols adopted in sequence, neither performed
    exercises, protocols, logged = _build()
    adopt(_three_week_protocol(), "user_recent", PARAMS,
          exercises=exercises, protocols=protocols)
    newer = adopt(_three_week_protocol(), "user_recent", PARAMS,
                  exercises=exercises, protocols=protocols)

    # Act
    current = current_protocol("user_recent", protocols=protocols, logged=logged)

    # Assert — Home focuses on the most recently adopted Protocol
    assert current.protocol.id == newer.id


def test_current_protocol_skips_a_fully_performed_protocol_for_an_older_one():
    # Arrange — an older in-progress Protocol, then a newer one performed to completion
    exercises, protocols, logged = _build()
    older = adopt(_three_week_protocol(), "user_skip", PARAMS,
                  exercises=exercises, protocols=protocols)
    newer = adopt(_three_week_protocol(), "user_skip", PARAMS,
                  exercises=exercises, protocols=protocols)
    for session in newer.sessions:
        _perform(logged, "user_skip", session.session_id)

    # Act
    current = current_protocol("user_skip", protocols=protocols, logged=logged)

    # Assert — the finished Protocol is passed over for the older, in-progress one
    assert current.protocol.id == older.id
    assert current.next_session.week == 1


def test_current_protocol_is_none_when_the_user_owns_no_protocol():
    # Arrange
    exercises, protocols, logged = _build()

    # Assert
    assert current_protocol("user_empty", protocols=protocols, logged=logged) is None


def test_current_protocol_is_none_when_every_protocol_is_complete():
    # Arrange — the user's only Protocol is fully performed
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_done_all", PARAMS,
                 exercises=exercises, protocols=protocols)
    for session in view.sessions:
        _perform(logged, "user_done_all", session.session_id)

    # Assert
    assert current_protocol("user_done_all", protocols=protocols, logged=logged) is None


def test_current_protocol_never_selects_another_users_protocol():
    # Arrange — only another user owns an in-progress Protocol
    exercises, protocols, logged = _build()
    adopt(_three_week_protocol(), "user_owner", PARAMS,
          exercises=exercises, protocols=protocols)

    # Assert — a different user has no Current Protocol
    assert current_protocol("user_intruder", protocols=protocols, logged=logged) is None
