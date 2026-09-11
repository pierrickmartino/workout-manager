"""Session rename at the repository seam (issue #394): ``set_name`` sets, edits, and
clears a standalone Session's user-given **Session Name**, and Duplicate carries it
verbatim (CONTEXT: Session Name). Exercised over both the in-memory fake and the real
SQLModel implementation so the two honor the same contract."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

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


def _draft(exercises) -> SessionDraft:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    return SessionDraft(
        training_type="strength",
        duration_minutes=45,
        prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
    )


def test_a_session_is_born_unnamed(repos):
    # Arrange / Act
    session_repo, exercises = repos
    view = session_repo.create("user_a", _draft(exercises))

    # Assert — no user-given name until one is set
    assert view.name is None


def test_set_name_stores_the_session_name(repos):
    # Arrange
    session_repo, exercises = repos
    source = session_repo.create("user_a", _draft(exercises))

    # Act
    renamed = session_repo.set_name(source.id, "user_a", "Leg Day A")

    # Assert
    assert renamed is not None
    assert renamed.name == "Leg Day A"
    assert session_repo.get(source.id, "user_a").name == "Leg Day A"


def test_set_name_can_clear_the_session_name(repos):
    # Arrange — a named Session
    session_repo, exercises = repos
    source = session_repo.create("user_a", _draft(exercises))
    session_repo.set_name(source.id, "user_a", "Leg Day A")

    # Act — clearing passes None
    cleared = session_repo.set_name(source.id, "user_a", None)

    # Assert — back to born-unnamed
    assert cleared.name is None


def test_set_name_leaves_prescriptions_untouched(repos):
    # Arrange
    session_repo, exercises = repos
    source = session_repo.create("user_a", _draft(exercises))

    # Act
    renamed = session_repo.set_name(source.id, "user_a", "Leg Day A")

    # Assert — renaming touches the plan's name only
    assert [p.exercise_name for p in renamed.prescriptions] == ["Back Squat"]


def test_set_name_does_not_touch_another_users_session(repos):
    # Arrange
    session_repo, exercises = repos
    source = session_repo.create("owner", _draft(exercises))

    # Act — a non-owner can never rename another user's plan
    result = session_repo.set_name(source.id, "intruder", "Mine now")

    # Assert
    assert result is None
    assert session_repo.get(source.id, "owner").name is None


def test_set_name_returns_none_for_an_unknown_session(repos):
    session_repo, _ = repos
    assert session_repo.set_name(999, "user_a", "Ghost") is None


def test_duplicate_carries_the_session_name_verbatim(repos):
    # Arrange — a named source Session
    session_repo, exercises = repos
    source = session_repo.create("user_a", _draft(exercises))
    session_repo.set_name(source.id, "user_a", "Leg Day A")

    # Act
    copy = session_repo.duplicate(source.id, "user_a")

    # Assert — the Session Name rides the copy (CONTEXT: carried verbatim across Duplicate)
    assert copy is not None
    assert copy.name == "Leg Day A"
