"""Migration test for the app_setting store + Active Skin seed (issue #331, ADR-0048).

Exercises 0026 end to end against a real SQLite database: upgrade from the
pre-app-setting revision over 0026 and assert the ``app_setting`` table arrives
seeded with exactly one global Active Skin row = PULSE (the app's first global,
mutable state). Downgrading drops the table again, so the migration reverses
cleanly and leaves the per-user tables untouched. Prior art:
tests/test_appearance_preference_migration.py."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_ACTIVE_SKIN = "0025_appearance_preference"
AFTER_ACTIVE_SKIN = "0026_active_skin"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'active_skin_migration.db'}"
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


def _active_skin_rows(url: str) -> list[tuple[str, str]]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return [
                (row[0], row[1])
                for row in conn.execute(
                    text("SELECT key, value FROM app_setting")
                ).all()
            ]
    finally:
        engine.dispose()


def test_upgrade_creates_app_setting_seeded_with_pulse(sqlite_url):
    # Arrange — the schema before the app-setting store existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_ACTIVE_SKIN)
    assert "app_setting" not in _table_names(sqlite_url)

    # Act — run the Active Skin migration
    command.upgrade(config, AFTER_ACTIVE_SKIN)

    # Assert — the table arrives seeded with exactly the one global Active Skin row
    assert "app_setting" in _table_names(sqlite_url)
    assert _active_skin_rows(sqlite_url) == [("active_skin", "pulse")]


def test_upgrade_keeps_the_per_user_tables_separate(sqlite_url):
    # Arrange / Act — after the Active Skin migration
    config = _alembic_config()
    command.upgrade(config, AFTER_ACTIVE_SKIN)

    # Assert — the global app-setting is its own store, distinct from user tables
    tables = _table_names(sqlite_url)
    assert "app_setting" in tables
    assert "appearance_preference" in tables
    assert "profile" in tables


def test_downgrade_drops_the_app_setting_table(sqlite_url):
    # Arrange — fully migrated with the app-setting table present
    config = _alembic_config()
    command.upgrade(config, AFTER_ACTIVE_SKIN)
    assert "app_setting" in _table_names(sqlite_url)

    # Act — reverse the migration
    command.downgrade(config, BEFORE_ACTIVE_SKIN)

    # Assert — the table is gone, the per-user stores untouched
    tables = _table_names(sqlite_url)
    assert "app_setting" not in tables
    assert "appearance_preference" in tables
    assert "profile" in tables
