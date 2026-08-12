"""``is_protocol_member`` on the Session read (Q2, ADR-0043 consequence).

A read-time fact off the Session's ``protocol_id`` linkage — never a stored flag — that
the web Session view uses to withhold the Duplicate control on a Protocol member. A
standalone Session (and every Duplicate copy, which lands standalone) reads ``False``; a
Protocol-member Session reads ``True``. The Duplicate endpoint itself is unchanged: only
the affordance is withheld, not the capability.

Exercised over both the in-memory fake and the real SQLModel implementation."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import ExercisePrescription, Protocol, WorkoutSession
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
    SqlSessionRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemorySessionRepository(exercises), exercises
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlSessionRepository(session), SqlExerciseRepository(session)


def _standalone_draft(exercises) -> SessionDraft:
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    return SessionDraft(
        training_type="strength",
        duration_minutes=45,
        prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
    )


def test_standalone_session_is_not_a_protocol_member(repos):
    # Arrange — a standalone Session (``create`` only ever builds standalone Sessions)
    session_repo, exercises = repos
    source = session_repo.create("user_alone", _standalone_draft(exercises))

    # Act
    view = session_repo.get(source.id, "user_alone")

    # Assert — no Protocol linkage → the Duplicate control is offered
    assert view.is_protocol_member is False


def test_a_duplicate_copy_is_never_a_protocol_member(repos):
    # Arrange — Duplicate always lands standalone (ADR-0043)
    session_repo, exercises = repos
    source = session_repo.create("user_dup", _standalone_draft(exercises))

    # Act
    copy = session_repo.duplicate(source.id, "user_dup")

    # Assert — the copy stands alone, so Duplicate stays available on it
    assert copy.is_protocol_member is False


def test_in_memory_protocol_member_session_reads_true():
    # A Protocol-member Session, seeded directly because ``create`` only builds standalone
    # Sessions. The in-memory fake is the test seam for the read-flag branch.
    exercises = InMemoryExerciseRepository()
    repo = InMemorySessionRepository(exercises)
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    repo._sessions[1] = WorkoutSession(
        id=1,
        clerk_user_id="user_proto",
        training_type="strength",
        duration_minutes=60,
        provenance="ai_generated",
        protocol_id=7,
        week=2,
        day=1,
        position=3,
    )
    repo._prescriptions[1] = [
        ExercisePrescription(
            id=1, session_id=1, exercise_id=squat.id, position=0, sets=5, reps="5"
        )
    ]

    # Act / Assert — a Protocol member withholds the Duplicate control
    view = repo.get(1, "user_proto")
    assert view.is_protocol_member is True


def test_sql_protocol_member_session_reads_true():
    # Arrange — a Protocol-member Session on the SQL path, with the parent Protocol row
    # present so the FK holds.
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as sql:
        exercises = SqlExerciseRepository(sql)
        repo = SqlSessionRepository(sql)
        squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
        protocol = Protocol(
            clerk_user_id="user_proto",
            training_type="strength",
            objective="hypertrophy",
            sessions_per_week=3,
            weeks=4,
            duration_minutes=60,
        )
        sql.add(protocol)
        sql.commit()
        sql.refresh(protocol)
        source = WorkoutSession(
            clerk_user_id="user_proto",
            training_type="strength",
            duration_minutes=60,
            provenance="ai_generated",
            protocol_id=protocol.id,
            week=2,
            day=1,
            position=3,
        )
        sql.add(source)
        sql.commit()
        sql.refresh(source)
        sql.add(
            ExercisePrescription(
                session_id=source.id, exercise_id=squat.id, position=0, sets=5, reps="5"
            )
        )
        sql.commit()

        # Act / Assert
        view = repo.get(source.id, "user_proto")
        assert view.is_protocol_member is True
