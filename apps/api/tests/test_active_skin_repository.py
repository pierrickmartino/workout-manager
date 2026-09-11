"""Behavior of the Active Skin repository, exercised through its public interface
against both the in-memory fake and the real SQLModel implementation. Running the
same contract over both keeps the fake honest.

The Active Skin is a single global app-setting (ADR-0048) — one logical row for
the whole app, not keyed per user — defaulting to PULSE when unset. Prior art:
tests/test_appearance_preference_repository.py."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.domain.skin import DEFAULT_ACTIVE_SKIN
from app.repositories.active_skin_repository import (
    InMemoryActiveSkinRepository,
    SqlActiveSkinRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryActiveSkinRepository()
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlActiveSkinRepository(session)


def test_defaults_to_pulse_when_unset(repo):
    # Act — a fresh store with no row seeded
    active = repo.get_active_skin()

    # Assert — the Active Skin's starting value is PULSE (ADR-0048)
    assert active == DEFAULT_ACTIVE_SKIN == "pulse"


def test_set_then_get_round_trips_the_published_skin(repo):
    # Act
    repo.set_active_skin("aurora")

    # Assert
    assert repo.get_active_skin() == "aurora"


def test_set_returns_the_stored_skin(repo):
    # Act
    returned = repo.set_active_skin("aurora")

    # Assert
    assert returned == "aurora"


def test_publishing_again_upserts_the_single_row(repo):
    # Arrange — first publish moves off the default
    repo.set_active_skin("aurora")

    # Act — publish back to PULSE
    repo.set_active_skin("pulse")

    # Assert — the one logical row is updated, not duplicated
    assert repo.get_active_skin() == "pulse"


def test_the_setting_is_global_not_per_user(repo):
    # Arrange / Act — a single publish with no user in sight
    repo.set_active_skin("aurora")

    # Assert — one app-wide value; there is no per-user variation to read
    assert repo.get_active_skin() == "aurora"
