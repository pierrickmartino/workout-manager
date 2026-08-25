"""Behavior of the Favorite repository through its public interface, over both the
in-memory fake and the real SQLModel implementation.

A Favorite is a **stored, per-user, per-copy** marker keyed by (user, session) (CONTEXT:
Favorite, issue #396): presence of a row means favorited, its absence means not. The marker
is private to the user — one user's mark never leaks into another's read — and both mark and
unmark are idempotent."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import WorkoutSession
from app.repositories.favorite_repository import (
    InMemoryFavoriteRepository,
    SqlFavoriteRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def favorites(request):
    if request.param == "in_memory":
        yield InMemoryFavoriteRepository(), None
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlFavoriteRepository(session), session


def _seed_session(db: Session | None, clerk_user_id: str = "user_a") -> int:
    """A persisted Session id for the SQL repo (its favorite row has a real FK target); the
    in-memory repo has no FK, so any id will do."""

    if db is None:
        return 1
    workout = WorkoutSession(
        clerk_user_id=clerk_user_id, training_type="strength", duration_minutes=45
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout.id


def test_a_session_is_not_favorite_by_default(favorites):
    # Arrange
    repo, db = favorites
    session_id = _seed_session(db)

    # Act / Assert — born absent
    assert repo.is_favorite("user_a", session_id) is False


def test_marking_a_session_makes_it_favorite(favorites):
    # Arrange
    repo, db = favorites
    session_id = _seed_session(db)

    # Act
    repo.set_favorite("user_a", session_id, True)

    # Assert
    assert repo.is_favorite("user_a", session_id) is True


def test_unmarking_a_favorite_session_clears_it(favorites):
    # Arrange — a favorited Session
    repo, db = favorites
    session_id = _seed_session(db)
    repo.set_favorite("user_a", session_id, True)

    # Act
    repo.set_favorite("user_a", session_id, False)

    # Assert
    assert repo.is_favorite("user_a", session_id) is False


def test_marking_is_idempotent(favorites):
    # Arrange
    repo, db = favorites
    session_id = _seed_session(db)

    # Act — marking twice keeps a single marker, never a duplicate the unique constraint rejects
    repo.set_favorite("user_a", session_id, True)
    repo.set_favorite("user_a", session_id, True)

    # Assert
    assert repo.is_favorite("user_a", session_id) is True


def test_unmarking_an_unfavorited_session_is_a_noop(favorites):
    # Arrange
    repo, db = favorites
    session_id = _seed_session(db)

    # Act / Assert — no row to drop, no error
    repo.set_favorite("user_a", session_id, False)
    assert repo.is_favorite("user_a", session_id) is False


def test_favorite_is_private_to_the_user(favorites):
    # Arrange — user_a favorites the Session
    repo, db = favorites
    session_id = _seed_session(db)
    repo.set_favorite("user_a", session_id, True)

    # Act / Assert — a second user's view of the same Session id is unaffected
    assert repo.is_favorite("user_a", session_id) is True
    assert repo.is_favorite("user_b", session_id) is False
