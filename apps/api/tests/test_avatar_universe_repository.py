"""Behavior of the Avatar Universe repository, exercised through its public interface
against both the in-memory fake and the real SQLModel implementation, so the fake stays
honest.

The Avatar Universe is a single global app-setting (ADR-0137) stored in the generic
``app_setting`` table beside the Active Skin, defaulting to The Realm when unset. Prior
art: tests/test_active_skin_repository.py."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, select

from app.db.models import AppSetting
from app.repositories.active_skin_repository import SqlActiveSkinRepository
from app.repositories.avatar_universe_repository import (
    AVATAR_UNIVERSE_KEY,
    InMemoryAvatarUniverseRepository,
    SqlAvatarUniverseRepository,
)
from tests.conftest import make_fk_engine


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryAvatarUniverseRepository()
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlAvatarUniverseRepository(session)


def test_defaults_to_the_realm_when_unset(repo):
    # Act — a fresh store with no row
    universe = repo.get_avatar_universe()

    # Assert — the original fantasy cast, with no seed migration needed
    assert universe == "realm"


def test_set_then_get_round_trips_the_published_universe(repo):
    # Act
    repo.set_avatar_universe("olympus")

    # Assert
    assert repo.get_avatar_universe() == "olympus"


def test_a_second_publish_replaces_the_first(repo):
    # Act
    repo.set_avatar_universe("orbit")
    repo.set_avatar_universe("olympus")

    # Assert — one universe at a time
    assert repo.get_avatar_universe() == "olympus"


def test_a_stored_id_no_longer_in_the_list_reads_as_the_realm():
    # Arrange — a row left behind by a universe since retired
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(AppSetting(key=AVATAR_UNIVERSE_KEY, value="atlantis"))
        session.commit()

        # Act
        universe = SqlAvatarUniverseRepository(session).get_avatar_universe()

    # Assert — a tolerant read, never an error
    assert universe == "realm"


def test_the_universe_and_the_active_skin_are_separate_rows():
    # Arrange
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        skins = SqlActiveSkinRepository(session)
        universes = SqlAvatarUniverseRepository(session)

        # Act — publish both settings into the one app_setting table
        skins.set_active_skin("aurora")
        universes.set_avatar_universe("orbit")
        keys = sorted(row.key for row in session.exec(select(AppSetting)).all())

        # Assert — neither publish overwrote the other
        assert skins.get_active_skin() == "aurora"
        assert universes.get_avatar_universe() == "orbit"
        assert keys == ["active_skin", "avatar_universe"]
