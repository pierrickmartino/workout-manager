"""Behavior of the Appearance Preference repository, exercised through its public
interface against both the in-memory fake and the real SQLModel implementation.
Running the same contract over both keeps the fake honest.

The store now holds the whole Interface Preference (Mode + Keep Screen Awake),
read and upserted as one value (ADR-0055), kept apart from the Fitness Profile
(ADR-0047). Prior art: tests/test_profile_repository.py."""

from __future__ import annotations

from dataclasses import replace

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.domain.appearance import InterfacePreference, Mode
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


def test_get_defaults_to_dark_and_awake_when_no_record_exists(repo):
    # Act — a user who has made no Interface Preference choice
    preference = repo.get_preference("user_default")

    # Assert — the shipped defaults: Dark look (ADR-0047) + Keep Screen Awake on
    assert preference == InterfacePreference(
        mode=Mode.DARK, keep_screen_awake=True
    )


def test_set_then_get_round_trips_the_whole_preference(repo):
    # Arrange / Act
    chosen = InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=False)
    repo.set_preference("user_light", chosen)

    # Assert
    assert repo.get_preference("user_light") == chosen


def test_set_returns_the_stored_preference(repo):
    # Act
    chosen = InterfacePreference(mode=Mode.SYSTEM, keep_screen_awake=False)
    returned = repo.set_preference("user_return", chosen)

    # Assert
    assert returned == chosen


def test_set_upserts_when_changing_an_existing_choice(repo):
    # Arrange — a user who first chose Light + awake on
    repo.set_preference(
        "user_change", InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=True)
    )

    # Act — later switches to Dark + awake off
    repo.set_preference(
        "user_change", InterfacePreference(mode=Mode.DARK, keep_screen_awake=False)
    )

    # Assert — the single row is updated, not duplicated
    assert repo.get_preference("user_change") == InterfacePreference(
        mode=Mode.DARK, keep_screen_awake=False
    )


def test_mode_and_keep_screen_awake_are_independently_stored(repo):
    # Arrange — start from a stored preference
    stored = repo.set_preference(
        "user_facets", InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=True)
    )

    # Act — flip only Keep Screen Awake, leaving Mode as-is
    repo.set_preference("user_facets", replace(stored, keep_screen_awake=False))

    # Assert — Mode is preserved while the behavioural facet changed
    assert repo.get_preference("user_facets") == InterfacePreference(
        mode=Mode.LIGHT, keep_screen_awake=False
    )


def test_keeps_distinct_users_isolated(repo):
    # Arrange
    repo.set_preference(
        "user_alice", InterfacePreference(mode=Mode.LIGHT, keep_screen_awake=False)
    )

    # Act / Assert — Bob is unaffected and still sees the shipped defaults
    assert repo.get_preference("user_alice") == InterfacePreference(
        mode=Mode.LIGHT, keep_screen_awake=False
    )
    assert repo.get_preference("user_bob") == InterfacePreference(
        mode=Mode.DARK, keep_screen_awake=True
    )


def test_stores_every_valid_mode(repo):
    # Arrange / Act / Assert — each closed Mode round-trips
    for user, mode in [
        ("user_l", Mode.LIGHT),
        ("user_d", Mode.DARK),
        ("user_s", Mode.SYSTEM),
    ]:
        chosen = InterfacePreference(mode=mode, keep_screen_awake=True)
        repo.set_preference(user, chosen)
        assert repo.get_preference(user) == chosen
