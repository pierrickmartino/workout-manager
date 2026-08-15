"""Migration test for the Appearance Preference table (issue #330, ADR-0047).

Exercises 0025 end to end against a real SQLite database: upgrade from the
pre-appearance revision over 0025 and assert the ``appearance_preference`` table
arrives, keyed per user and starting empty — absence of a row is the default
(Dark), so no user is seeded and no existing user is light-flipped. Downgrading
drops the table again, so the migration reverses cleanly and leaves the Fitness
Profile untouched."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_APPEARANCE = "0024_exercise_image"
AFTER_APPEARANCE = "0025_appearance_preference"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'appearance_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _table_names(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_upgrade_creates_an_empty_per_user_appearance_table(sqlite_url):
    # Arrange — the schema before the Appearance Preference store existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_APPEARANCE)
    assert "appearance_preference" not in _table_names(sqlite_url)

    # Act — run the Appearance Preference migration
    command.upgrade(config, AFTER_APPEARANCE)

    # Assert — the separate table arrives and starts empty (no row is seeded, so
    # every existing user keeps the default Dark — ADR-0047).
    assert "appearance_preference" in _table_names(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            count = conn.execute(
                text("SELECT COUNT(*) FROM appearance_preference")
            ).scalar_one()
    finally:
        engine.dispose()
    assert count == 0


def test_upgrade_keeps_the_profile_table_separate(sqlite_url):
    # Arrange / Act — after the appearance migration
    config = _alembic_config()
    command.upgrade(config, AFTER_APPEARANCE)

    # Assert — appearance is its own store, distinct from the Fitness Profile
    tables = _table_names(sqlite_url)
    assert "appearance_preference" in tables
    assert "profile" in tables


def test_downgrade_drops_the_appearance_table(sqlite_url):
    # Arrange — fully migrated with the appearance table present
    config = _alembic_config()
    command.upgrade(config, AFTER_APPEARANCE)
    assert "appearance_preference" in _table_names(sqlite_url)

    # Act — reverse the migration
    command.downgrade(config, BEFORE_APPEARANCE)

    # Assert — the table is gone, the profile store untouched
    tables = _table_names(sqlite_url)
    assert "appearance_preference" not in tables
    assert "profile" in tables
