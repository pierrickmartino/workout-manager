"""Migration test for the ``session_favorite`` table (issue #396).

Exercises 0032 end to end against a real SQLite database: upgrade creates the per-user
Favorite table (CONTEXT: Favorite) and its unique ``(clerk_user_id, session_id)`` constraint,
so a user favorites one Session once; downgrading one step drops it, so the migration is
reversible. There is no backfill — a Favorite is born absent."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_FAVORITE = "0031_session_author"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'session_favorite_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _has_table(url: str, table: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type = 'table' AND name = :name"
                ),
                {"name": table},
            ).all()
        return len(rows) == 1
    finally:
        engine.dispose()


def _seed_session(url: str) -> None:
    """A Session row so the favorite's foreign key has a real target."""

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


def _insert_favorite(url: str, clerk_user_id: str, session_id: int) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO session_favorite "
                    "(clerk_user_id, session_id, created_at) "
                    "VALUES (:user, :session, '2026-08-25 00:00:00')"
                ),
                {"user": clerk_user_id, "session": session_id},
            )
    finally:
        engine.dispose()


def test_upgrade_creates_the_favorite_table(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_FAVORITE)
    assert not _has_table(sqlite_url, "session_favorite")  # guard

    # Act
    command.upgrade(config, "0032_session_favorite")

    # Assert
    assert _has_table(sqlite_url, "session_favorite")


def test_favorite_is_unique_per_user_and_session(sqlite_url):
    # Arrange — the table plus a Session to reference
    config = _alembic_config()
    command.upgrade(config, "0032_session_favorite")
    _seed_session(sqlite_url)

    # Act — a first mark inserts; a second (user, session) mark violates the unique constraint
    _insert_favorite(sqlite_url, "owner_1", 1)

    # Assert — the mark is idempotent at the schema level (one row per user/session)
    with pytest.raises(IntegrityError):
        _insert_favorite(sqlite_url, "owner_1", 1)


def test_downgrade_drops_the_favorite_table(sqlite_url):
    # Arrange — fully migrated with the table present
    config = _alembic_config()
    command.upgrade(config, "0032_session_favorite")

    # Act — step back over the migration
    command.downgrade(config, BEFORE_FAVORITE)

    # Assert — the table is gone again
    assert not _has_table(sqlite_url, "session_favorite")
