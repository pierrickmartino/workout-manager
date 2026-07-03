"""Behavior of the Protocol repository through its public interface, over both the
in-memory fake and the real SQLModel implementation. A Protocol is user-owned and
multi-week; reading it back returns its fully-enumerated Sessions in self-paced
order (by ``position``), each joined to its ordered Exercise Prescriptions and
their catalog Exercises. Reads are owner-scoped — a Protocol is never served to
another user."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.protocol_repository import (
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
    SqlProtocolRepository,
)
from app.repositories.session_repository import PrescriptionDraft


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemoryProtocolRepository(exercises), exercises
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlProtocolRepository(session), SqlExerciseRepository(session)


def _two_week_draft(exercises) -> ProtocolDraft:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create("Overhead Press", provenance=Provenance.AI_GENERATED)
    sessions = []
    for week in (1, 2):
        sessions.append(
            ProtocolSessionDraft(
                week=week,
                day=1,
                title=f"Week {week} Push",
                prescriptions=[
                    PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5"),
                    PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
                ],
            )
        )
    return ProtocolDraft(
        training_type="strength",
        objective="gain muscle mass",
        sessions_per_week=1,
        weeks=2,
        duration_minutes=45,
        sessions=sessions,
    )


def test_create_persists_a_user_owned_protocol(repos):
    # Arrange
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_owner", _two_week_draft(exercises))

    # Assert
    assert view.id is not None
    assert view.clerk_user_id == "user_owner"
    assert view.training_type == "strength"
    assert view.objective == "gain muscle mass"
    assert view.weeks == 2


def test_protocol_enumerates_every_week_in_position_order(repos):
    # Arrange
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_weeks", _two_week_draft(exercises))

    # Assert — two distinct weekly Sessions, ordered by position
    assert [s.position for s in view.sessions] == [0, 1]
    assert [s.week for s in view.sessions] == [1, 2]
    assert view.sessions[0].title == "Week 1 Push"


def test_protocol_sessions_carry_their_prescriptions_joined_to_exercises(repos):
    # Arrange
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_pres", _two_week_draft(exercises))

    # Assert — each Session reuses the shared catalog Exercises in order
    first = view.sessions[0]
    assert [p.exercise_name for p in first.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert first.prescriptions[0].targeted_muscles == ["quads"]


def test_each_protocol_session_has_a_distinct_underlying_session_id(repos):
    # Arrange — Week-1 and Week-2 are genuinely distinct Sessions (ADR-0001)
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_ids", _two_week_draft(exercises))

    # Assert
    ids = [s.session_id for s in view.sessions]
    assert len(set(ids)) == len(ids)


def test_get_returns_the_protocol_for_its_owner(repos):
    # Arrange
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_a", _two_week_draft(exercises))

    # Act
    fetched = protocol_repo.get(created.id, "user_a")

    # Assert
    assert fetched is not None
    assert fetched.id == created.id
    assert len(fetched.sessions) == 2


def test_get_does_not_leak_another_users_protocol(repos):
    # Arrange
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_owner", _two_week_draft(exercises))

    # Act
    fetched = protocol_repo.get(created.id, "user_intruder")

    # Assert
    assert fetched is None


def test_get_returns_none_for_an_unknown_protocol(repos):
    # Arrange
    protocol_repo, _ = repos

    # Assert
    assert protocol_repo.get(987654, "user_any") is None


def test_list_for_user_orders_protocols_most_recently_adopted_first(repos):
    # Arrange — the same user adopts two Protocols in sequence
    protocol_repo, exercises = repos
    first = protocol_repo.create("user_seq", _two_week_draft(exercises))
    second = protocol_repo.create("user_seq", _two_week_draft(exercises))

    # Act
    listed = protocol_repo.list_for_user("user_seq")

    # Assert — the most-recently-adopted Protocol comes first
    assert [p.id for p in listed] == [second.id, first.id]


def test_list_for_user_never_returns_another_users_protocols(repos):
    # Arrange — two users each own a Protocol
    protocol_repo, exercises = repos
    mine = protocol_repo.create("user_mine", _two_week_draft(exercises))
    protocol_repo.create("user_other", _two_week_draft(exercises))

    # Act
    listed = protocol_repo.list_for_user("user_mine")

    # Assert — only the owner's Protocol is returned
    assert [p.id for p in listed] == [mine.id]


def test_list_for_user_is_empty_when_the_user_owns_no_protocol(repos):
    # Arrange
    protocol_repo, _ = repos

    # Assert
    assert protocol_repo.list_for_user("user_none") == []
