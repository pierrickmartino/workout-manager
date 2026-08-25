"""The Favorite marker surfaced through the SessionRepository, over both the in-memory fake
and the real SQLModel implementation (CONTEXT: Favorite, issue #396).

``set_favorite`` marks/unmarks the owner's own standalone Session and surfaces the state on
the read (``SessionView.is_favorite``). The marker is per-user (a non-owner can't touch it)
and per-copy: it is **not** carried by Duplicate — a copy is a new Session with no marker, so
it reads back un-favorited."""

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


def test_a_new_session_reads_as_not_favorite(repos):
    # Arrange
    sessions, exercises = repos
    created = sessions.create("user_a", _draft(exercises))

    # Act
    view = sessions.get(created.id, "user_a")

    # Assert — born un-favorited
    assert view.is_favorite is False


def test_marking_a_session_surfaces_on_the_read(repos):
    # Arrange
    sessions, exercises = repos
    created = sessions.create("user_a", _draft(exercises))

    # Act
    marked = sessions.set_favorite(created.id, "user_a", True)

    # Assert — the returned view and a fresh read both reflect the mark
    assert marked.is_favorite is True
    assert sessions.get(created.id, "user_a").is_favorite is True


def test_unmarking_a_session_clears_it_on_the_read(repos):
    # Arrange — a favorited Session
    sessions, exercises = repos
    created = sessions.create("user_a", _draft(exercises))
    sessions.set_favorite(created.id, "user_a", True)

    # Act
    unmarked = sessions.set_favorite(created.id, "user_a", False)

    # Assert
    assert unmarked.is_favorite is False
    assert sessions.get(created.id, "user_a").is_favorite is False


def test_set_favorite_404s_for_a_non_owner(repos):
    # Arrange — user_a owns the Session
    sessions, exercises = repos
    created = sessions.create("user_a", _draft(exercises))

    # Act — a different user tries to favorite it
    result = sessions.set_favorite(created.id, "user_intruder", True)

    # Assert — refused (None), and the owner's state is untouched
    assert result is None
    assert sessions.get(created.id, "user_a").is_favorite is False


def test_favorite_is_not_carried_by_duplicate(repos):
    # Arrange — a favorited source Session
    sessions, exercises = repos
    source = sessions.create("user_a", _draft(exercises))
    sessions.set_favorite(source.id, "user_a", True)
    assert sessions.get(source.id, "user_a").is_favorite is True  # guard

    # Act — Duplicate deep-copies the plan
    copy = sessions.duplicate(source.id, "user_a")

    # Assert — the copy is a new Session with no marker: it starts un-favorited, while the
    # source keeps its own mark (per-copy, CONTEXT: Favorite)
    assert copy.id != source.id
    assert copy.is_favorite is False
    assert sessions.get(source.id, "user_a").is_favorite is True
