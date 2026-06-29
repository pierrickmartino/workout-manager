"""Behavior of the Profile repository, exercised through its public interface
against both the in-memory fake and the real SQLModel implementation. Running
the same contract over both keeps the fake honest."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
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


def _full_update() -> ProfileUpdate:
    return ProfileUpdate(
        display_name="Alex",
        gender="female",
        age=34,
        height_cm=170.0,
        weight_kg=65.5,
        training_habits="3x/week, mostly evenings",
        default_equipment=["dumbbells", "pull-up bar"],
        recent_workout="45 min upper-body session yesterday",
        fitness_levels={"strength": 8, "yoga": 2},
        preferences=["no running"],
        sensitive_constraints=["postpartum"],
    )


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


def test_update_persists_the_full_profile(repo):
    # Arrange
    repo.get_or_create("user_full")

    # Act
    updated = repo.update("user_full", _full_update())

    # Assert
    assert updated.gender == "female"
    assert updated.age == 34
    assert updated.height_cm == 170.0
    assert updated.weight_kg == 65.5
    assert updated.training_habits == "3x/week, mostly evenings"
    assert updated.default_equipment == ["dumbbells", "pull-up bar"]
    assert updated.recent_workout == "45 min upper-body session yesterday"


def test_update_stores_fitness_level_per_training_type(repo):
    # Arrange
    repo.get_or_create("user_levels")

    # Act
    updated = repo.update("user_levels", _full_update())

    # Assert — not one global value
    assert updated.fitness_levels == {"strength": 8, "yoga": 2}


def test_update_keeps_preferences_and_sensitive_constraints_distinct(repo):
    # Arrange
    repo.get_or_create("user_constraints")

    # Act
    updated = repo.update("user_constraints", _full_update())

    # Assert
    assert updated.preferences == ["no running"]
    assert updated.sensitive_constraints == ["postpartum"]


def test_update_round_trips_on_subsequent_get(repo):
    # Arrange
    repo.update("user_persist", _full_update())

    # Act
    reloaded = repo.get_or_create("user_persist")

    # Assert
    assert reloaded.fitness_levels == {"strength": 8, "yoga": 2}
    assert reloaded.sensitive_constraints == ["postpartum"]


def test_update_creates_the_profile_when_absent(repo):
    # Act — onboarding may PUT before any GET has created the row
    updated = repo.update("user_brandnew", _full_update())

    # Assert
    assert updated.clerk_user_id == "user_brandnew"
    assert updated.age == 34
