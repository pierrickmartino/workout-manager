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
BEFORE_KEEP_AWAKE = "0028_pin_rep_target"
AFTER_KEEP_AWAKE = "0029_keep_screen_awake"
BEFORE_WEIGHT_UNIT = "0033_share_link"
AFTER_WEIGHT_UNIT = "0034_weight_unit"


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


def _column_names(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        return {col["name"] for col in inspect(engine).get_columns(table)}
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


def test_keep_screen_awake_column_backfills_existing_rows_to_on(sqlite_url):
    # Arrange — schema at 0028, before Keep Screen Awake, with an existing user's
    # Mode-only Appearance Preference row already stored
    config = _alembic_config()
    command.upgrade(config, BEFORE_KEEP_AWAKE)
    assert "keep_screen_awake" not in _column_names(
        sqlite_url, "appearance_preference"
    )
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO appearance_preference (clerk_user_id, mode) "
                    "VALUES ('user_existing', 'light')"
                )
            )
    finally:
        engine.dispose()

    # Act — add the behavioural facet (ADR-0055)
    command.upgrade(config, AFTER_KEEP_AWAKE)

    # Assert — the column arrives and the returning user's row is backfilled to the
    # on-by-default value, their Mode choice undisturbed (ADR-0047)
    assert "keep_screen_awake" in _column_names(
        sqlite_url, "appearance_preference"
    )
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT mode, keep_screen_awake FROM appearance_preference "
                    "WHERE clerk_user_id = 'user_existing'"
                )
            ).one()
    finally:
        engine.dispose()
    assert row.mode == "light"
    assert bool(row.keep_screen_awake) is True


def test_downgrade_drops_the_keep_screen_awake_column(sqlite_url):
    # Arrange — fully migrated with the new column present
    config = _alembic_config()
    command.upgrade(config, AFTER_KEEP_AWAKE)
    assert "keep_screen_awake" in _column_names(
        sqlite_url, "appearance_preference"
    )

    # Act — reverse just this migration
    command.downgrade(config, BEFORE_KEEP_AWAKE)

    # Assert — the column is gone but the Mode column (and the table) remain
    columns = _column_names(sqlite_url, "appearance_preference")
    assert "keep_screen_awake" not in columns
    assert "mode" in columns


def test_weight_unit_column_backfills_existing_rows_to_kg(sqlite_url):
    # Arrange — schema at 0033, before Weight Unit, with an existing user's
    # Mode + Keep-Screen-Awake row already stored
    config = _alembic_config()
    command.upgrade(config, BEFORE_WEIGHT_UNIT)
    assert "weight_unit" not in _column_names(sqlite_url, "appearance_preference")
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO appearance_preference "
                    "(clerk_user_id, mode, keep_screen_awake) "
                    "VALUES ('user_existing', 'light', 0)"
                )
            )
    finally:
        engine.dispose()

    # Act — add the Weight Unit facet (CONTEXT "Weight Unit")
    command.upgrade(config, AFTER_WEIGHT_UNIT)

    # Assert — the column arrives and the returning user's row is backfilled to the
    # canonical kilograms, their other facets undisturbed (ADR-0047)
    assert "weight_unit" in _column_names(sqlite_url, "appearance_preference")
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT mode, keep_screen_awake, weight_unit "
                    "FROM appearance_preference WHERE clerk_user_id = 'user_existing'"
                )
            ).one()
    finally:
        engine.dispose()
    assert row.mode == "light"
    assert bool(row.keep_screen_awake) is False
    assert row.weight_unit == "kg"


def test_downgrade_drops_the_weight_unit_column(sqlite_url):
    # Arrange — fully migrated with the new column present
    config = _alembic_config()
    command.upgrade(config, AFTER_WEIGHT_UNIT)
    assert "weight_unit" in _column_names(sqlite_url, "appearance_preference")

    # Act — reverse just this migration
    command.downgrade(config, BEFORE_WEIGHT_UNIT)

    # Assert — the column is gone but the columns it sat beside (and the table) remain
    columns = _column_names(sqlite_url, "appearance_preference")
    assert "weight_unit" not in columns
    assert "mode" in columns
    assert "keep_screen_awake" in columns
