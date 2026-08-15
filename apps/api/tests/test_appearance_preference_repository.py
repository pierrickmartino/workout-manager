"""Behavior of the Appearance Preference repository, exercised through its public
interface against both the in-memory fake and the real SQLModel implementation.
Running the same contract over both keeps the fake honest.

The Appearance Preference is the per-user Mode, stored apart from the Fitness
Profile (ADR-0047). Prior art: tests/test_profile_repository.py."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.domain.appearance import Mode
from app.repositories.appearance_preference_repository import (
    InMemoryAppearancePreferenceRepository,
    SqlAppearancePreferenceRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryAppearancePreferenceRepository()
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlAppearancePreferenceRepository(session)


def test_get_defaults_to_dark_when_no_record_exists(repo):
    # Act — a user who has made no Appearance choice
    mode = repo.get_mode("user_default")

    # Assert — the shipped default preserves today's all-dark look (ADR-0047)
    assert mode == Mode.DARK


def test_set_then_get_round_trips_the_chosen_mode(repo):
    # Arrange / Act
    repo.set_mode("user_light", Mode.LIGHT)

    # Assert
    assert repo.get_mode("user_light") == Mode.LIGHT


def test_set_returns_the_stored_mode(repo):
    # Act
    returned = repo.set_mode("user_return", Mode.SYSTEM)

    # Assert
    assert returned == Mode.SYSTEM


def test_set_upserts_when_changing_an_existing_choice(repo):
    # Arrange — a user who first chose Light
    repo.set_mode("user_change", Mode.LIGHT)

    # Act — later switches to Dark
    repo.set_mode("user_change", Mode.DARK)

    # Assert — the single row is updated, not duplicated
    assert repo.get_mode("user_change") == Mode.DARK


def test_keeps_distinct_users_isolated(repo):
    # Arrange
    repo.set_mode("user_alice", Mode.LIGHT)

    # Act / Assert — Bob is unaffected and still sees the default
    assert repo.get_mode("user_alice") == Mode.LIGHT
    assert repo.get_mode("user_bob") == Mode.DARK


def test_stores_every_valid_mode(repo):
    # Arrange / Act / Assert — each closed Mode round-trips
    for user, mode in [
        ("user_l", Mode.LIGHT),
        ("user_d", Mode.DARK),
        ("user_s", Mode.SYSTEM),
    ]:
        repo.set_mode(user, mode)
        assert repo.get_mode(user) == mode
