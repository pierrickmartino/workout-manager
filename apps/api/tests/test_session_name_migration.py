"""Migration test for the standalone Session ``name`` column (issue #394).

Exercises 0030 end to end against a real SQLite database: seed a WorkoutSession at the
prior revision (before the column existed), upgrade over 0030, and assert the row gains
a nullable ``name`` that defaults to NULL — an existing Session that was never named
reads through its derived ``training_type · date`` label with no backfill. Downgrading
one step drops the column again, so the migration is reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_NAME = "0029_keep_screen_awake"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'session_name_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_session(url: str) -> None:
    """Insert a WorkoutSession as it existed before the ``name`` column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, "
                    "provenance, has_been_regenerated, created_at) "
                    "VALUES (1, 'user_1', 'strength', 45, 'ai_generated', 0, "
                    "'2026-08-25 00:00:00')"
                )
            )
    finally:
        engine.dispose()


def _name(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT name AS value FROM workout_session WHERE id = :id"),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_name_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(workout_session)")).all()
        return any(column.name == "name" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_name_defaulting_to_null(sqlite_url):
    # Arrange — a Session from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_NAME)
    _seed_session(sqlite_url)

    # Act — run the Session name migration
    command.upgrade(config, "0030_session_name")

    # Assert — the column now exists and the existing row is NULL (born unnamed, no backfill)
    assert _has_name_column(sqlite_url)
    assert _name(sqlite_url, 1) is None


def test_downgrade_drops_the_name_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0030_session_name")
    _seed_session(sqlite_url)

    # Act — step back over the Session name migration
    command.downgrade(config, BEFORE_NAME)

    # Assert — the column is gone again
    assert not _has_name_column(sqlite_url)
