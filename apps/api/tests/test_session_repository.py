"""Behavior of the WorkoutSession repository through its public interface, over
both the in-memory fake and the real SQLModel implementation. A Session is
user-owned and standalone here; reading it back returns the ordered Exercise
Prescriptions joined to their catalog Exercises."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

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
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlSessionRepository(session), SqlExerciseRepository(session)


def _draft_with_two_prescriptions(exercises) -> SessionDraft:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create(
        "Overhead Press", provenance=Provenance.AI_GENERATED
    )
    return SessionDraft(
        training_type="strength",
        duration_minutes=45,
        prescriptions=[
            PrescriptionDraft(
                exercise_id=squat.id,
                sets=5,
                reps="5",
                rest_seconds=120,
                tempo="3-1-1",
                recommended_load="70% 1RM",
            ),
            PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
        ],
    )


def test_create_persists_a_user_owned_standalone_session(repos):
    # Arrange
    session_repo, exercises = repos

    # Act
    view = session_repo.create("user_owner", _draft_with_two_prescriptions(exercises))

    # Assert
    assert view.id is not None
    assert view.clerk_user_id == "user_owner"
    assert view.training_type == "strength"
    assert view.duration_minutes == 45


def test_created_session_carries_its_prescriptions_in_order(repos):
    # Arrange
    session_repo, exercises = repos

    # Act
    view = session_repo.create("user_pres", _draft_with_two_prescriptions(exercises))

    # Assert — order preserved, exercise joined, prescription fields present
    assert [p.exercise_name for p in view.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    first = view.prescriptions[0]
    assert first.sets == 5
    assert first.reps == "5"
    assert first.rest_seconds == 120
    assert first.tempo == "3-1-1"
    assert first.recommended_load == "70% 1RM"
    assert first.targeted_muscles == ["quads"]


def test_get_returns_the_session_for_its_owner(repos):
    # Arrange
    session_repo, exercises = repos
    created = session_repo.create("user_a", _draft_with_two_prescriptions(exercises))

    # Act
    fetched = session_repo.get(created.id, "user_a")

    # Assert
    assert fetched is not None
    assert fetched.id == created.id
    assert len(fetched.prescriptions) == 2


def test_get_does_not_leak_another_users_session(repos):
    # Arrange — a Session is user-owned; another user must not read it
    session_repo, exercises = repos
    created = session_repo.create("user_owner", _draft_with_two_prescriptions(exercises))

    # Act
    fetched = session_repo.get(created.id, "user_intruder")

    # Assert
    assert fetched is None


def test_get_returns_none_for_an_unknown_session(repos):
    # Arrange
    session_repo, _ = repos

    # Assert
    assert session_repo.get(123456, "user_any") is None
