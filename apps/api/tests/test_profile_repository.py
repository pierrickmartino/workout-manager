"""Behavior of the Profile repository, exercised through its public interface
against both the in-memory fake and the real SQLModel implementation. Running
the same contract over both keeps the fake honest."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    SqlProfileRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryProfileRepository()
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlProfileRepository(session)


def test_creates_a_profile_on_first_get_with_null_display_name(repo):
    # Act
    profile = repo.get_or_create("user_first")

    # Assert
    assert profile.clerk_user_id == "user_first"
    assert profile.display_name is None


def test_returns_the_same_profile_on_subsequent_gets(repo):
    # Arrange
    created = repo.get_or_create("user_repeat")

    # Act
    again = repo.get_or_create("user_repeat")

    # Assert
    assert again.id == created.id
    assert again.clerk_user_id == "user_repeat"


def test_keeps_distinct_users_isolated(repo):
    # Act
    alice = repo.get_or_create("user_alice")
    bob = repo.get_or_create("user_bob")

    # Assert
    assert alice.id != bob.id
    assert alice.clerk_user_id == "user_alice"
    assert bob.clerk_user_id == "user_bob"
