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


def test_a_new_session_has_not_been_regenerated(repos):
    # Arrange / Act
    session_repo, exercises = repos
    view = session_repo.create("user_fresh", _draft_with_two_prescriptions(exercises))

    # Assert — the once-per-Session guard starts open
    assert view.has_been_regenerated is False


def _replacement(exercises) -> PrescriptionDraft:
    goblet = exercises.find_or_create(
        "Goblet Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    return PrescriptionDraft(
        exercise_id=goblet.id, sets=3, reps="10", recommended_load="moderate"
    )


def test_regenerate_keeps_chosen_prescriptions_and_replaces_the_rest(repos):
    # Arrange — a two-exercise Session; keep the first, drop the second
    session_repo, exercises = repos
    created = session_repo.create(
        "user_regen", _draft_with_two_prescriptions(exercises)
    )

    # Act
    view = session_repo.regenerate(
        created.id,
        "user_regen",
        keep_positions=[0],
        replacements=[_replacement(exercises)],
    )

    # Assert — kept first (original order), then replacements, re-positioned 0..n
    assert view is not None
    assert [p.exercise_name for p in view.prescriptions] == [
        "Back Squat",
        "Goblet Squat",
    ]
    assert [p.position for p in view.prescriptions] == [0, 1]
    assert view.has_been_regenerated is True


def test_regenerated_session_reads_back_with_the_new_prescriptions(repos):
    # Arrange
    session_repo, exercises = repos
    created = session_repo.create(
        "user_persist", _draft_with_two_prescriptions(exercises)
    )

    # Act
    session_repo.regenerate(
        created.id,
        "user_persist",
        keep_positions=[0],
        replacements=[_replacement(exercises)],
    )
    refetched = session_repo.get(created.id, "user_persist")

    # Assert — the change persisted, including the guard
    assert [p.exercise_name for p in refetched.prescriptions] == [
        "Back Squat",
        "Goblet Squat",
    ]
    assert refetched.has_been_regenerated is True


def test_regenerate_does_not_touch_another_users_session(repos):
    # Arrange — regeneration only ever mutates the owner's own copy
    session_repo, exercises = repos
    created = session_repo.create(
        "user_owner", _draft_with_two_prescriptions(exercises)
    )

    # Act
    result = session_repo.regenerate(
        created.id,
        "user_intruder",
        keep_positions=[0],
        replacements=[_replacement(exercises)],
    )

    # Assert — refused, and the owner's Session is untouched
    assert result is None
    owner_view = session_repo.get(created.id, "user_owner")
    assert [p.exercise_name for p in owner_view.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert owner_view.has_been_regenerated is False


def test_regenerate_returns_none_for_an_unknown_session(repos):
    # Arrange
    session_repo, exercises = repos

    # Assert
    assert (
        session_repo.regenerate(
            424242,
            "user_any",
            keep_positions=[],
            replacements=[_replacement(exercises)],
        )
        is None
    )


def test_substitute_prescription_swaps_only_the_targeted_exercise(repos):
    # Arrange — a two-exercise Session; swap the first prescription's Exercise
    session_repo, exercises = repos
    created = session_repo.create(
        "user_sub", _draft_with_two_prescriptions(exercises)
    )
    goblet = exercises.find_or_create(
        "Goblet Squat", provenance=Provenance.CURATED
    )

    # Act
    view = session_repo.substitute_prescription(
        created.id, "user_sub", 0, goblet.id
    )

    # Assert — only position 0's Exercise changed; sets/reps and the guard kept
    assert view is not None
    assert [p.exercise_name for p in view.prescriptions] == [
        "Goblet Squat",
        "Overhead Press",
    ]
    assert view.prescriptions[0].sets == 5 and view.prescriptions[0].reps == "5"
    assert view.has_been_regenerated is False


def test_substitute_prescription_persists_and_reads_back(repos):
    session_repo, exercises = repos
    created = session_repo.create(
        "user_subp", _draft_with_two_prescriptions(exercises)
    )
    goblet = exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)

    session_repo.substitute_prescription(created.id, "user_subp", 0, goblet.id)
    refetched = session_repo.get(created.id, "user_subp")

    assert refetched.prescriptions[0].exercise_name == "Goblet Squat"
    assert refetched.has_been_regenerated is False


def test_substitute_prescription_does_not_touch_another_users_session(repos):
    session_repo, exercises = repos
    created = session_repo.create(
        "user_owner3", _draft_with_two_prescriptions(exercises)
    )
    goblet = exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)

    result = session_repo.substitute_prescription(
        created.id, "user_intruder3", 0, goblet.id
    )

    assert result is None
    owner_view = session_repo.get(created.id, "user_owner3")
    assert owner_view.prescriptions[0].exercise_name == "Back Squat"


def test_substitute_prescription_returns_none_for_an_absent_position(repos):
    session_repo, exercises = repos
    created = session_repo.create(
        "user_pos", _draft_with_two_prescriptions(exercises)
    )

    assert session_repo.substitute_prescription(created.id, "user_pos", 99, 1) is None
