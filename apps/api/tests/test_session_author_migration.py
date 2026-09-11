"""Migration test for the Session ``author_clerk_user_id`` column (issue #395).

Exercises 0031 end to end against a real SQLite database: seed a WorkoutSession at the
prior revision (before the column existed), upgrade over 0031, and assert the row gains
an ``author_clerk_user_id`` **backfilled to its owner** — so no pre-existing Session reads
as authorless (CONTEXT: Author). Downgrading one step drops the column again, so the
migration is reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_AUTHOR = "0030_session_name"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'session_author_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_session(url: str) -> None:
    """Insert a WorkoutSession as it existed before the ``author_clerk_user_id`` column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, "
                    "provenance, has_been_regenerated, created_at) "
                    "VALUES (1, 'owner_1', 'strength', 45, 'ai_generated', 0, "
                    "'2026-08-25 00:00:00')"
                )
            )
    finally:
        engine.dispose()


def _author(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT author_clerk_user_id AS value "
                    "FROM workout_session WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_author_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(workout_session)")).all()
        return any(column.name == "author_clerk_user_id" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_backfills_the_author_to_the_owner(sqlite_url):
    # Arrange — a Session from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_AUTHOR)
    _seed_session(sqlite_url)

    # Act — run the Session author migration
    command.upgrade(config, "0031_session_author")

    # Assert — the column exists and the pre-existing row is attributed to its owner (no
    # Session reads as authorless)
    assert _has_author_column(sqlite_url)
    assert _author(sqlite_url, 1) == "owner_1"


def test_downgrade_drops_the_author_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0031_session_author")
    _seed_session(sqlite_url)

    # Act — step back over the Session author migration
    command.downgrade(config, BEFORE_AUTHOR)

    # Assert — the column is gone again
    assert not _has_author_column(sqlite_url)
