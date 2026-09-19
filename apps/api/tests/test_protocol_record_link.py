"""The record link on a performed Protocol Session (Q7, plan≠record).

A performed schedule card on the Protocol overview links to the *record* the user
made, not the plan — so the serialized ``ProtocolSession`` carries the advancing
Logged Session id (``logged_session_id``). An un-performed Session, and the
``next_session`` (which is un-performed by definition), carry ``null``.
"""

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
from app.protocols.serialization import serialize_protocol_progress
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


def test_performed_session_serializes_its_record_link_and_others_null():
    # Arrange — perform Week 1 (Completed); Weeks 2–3 are un-performed.
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_link", PARAMS,
                 exercises=exercises, protocols=protocols)
    week_one = view.sessions[0].session_id
    log = logged.create(
        "user_link",
        LoggedSessionDraft(
            session_id=week_one,
            performed_on=date(2026, 1, 1),
            completion_outcome="completed",
            logged_sets=[],
        ),
    )
    progress = progressed_protocol(
        "user_link", view.id, protocols=protocols, logged=logged
    )

    # Act
    data = serialize_protocol_progress(progress)

    # Assert — the performed Session carries its advancing log id; the un-performed ones
    # carry null, and so does the (un-performed) next_session.
    by_id = {s["session_id"]: s for s in data["sessions"]}
    assert by_id[week_one]["performed"] is True
    assert by_id[week_one]["logged_session_id"] == log.id
    for upcoming in view.sessions[1:]:
        assert by_id[upcoming.session_id]["logged_session_id"] is None
    assert data["next_session"]["logged_session_id"] is None


def test_a_brand_new_protocol_serializes_all_null_record_links():
    # Arrange — nothing performed yet.
    exercises, protocols, logged = _build()
    view = adopt(_three_week_protocol(), "user_fresh", PARAMS,
                 exercises=exercises, protocols=protocols)
    progress = progressed_protocol(
        "user_fresh", view.id, protocols=protocols, logged=logged
    )

    # Act
    data = serialize_protocol_progress(progress)

    # Assert
    assert all(s["logged_session_id"] is None for s in data["sessions"])
    assert data["next_session"]["logged_session_id"] is None
