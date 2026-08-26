"""Migration test for the ``share_link`` table (issue #398).

Exercises 0033 end to end against a real SQLite database: upgrade creates the Share Link
table (CONTEXT: Share Link) with a unique ``token``, so a preview/redeem lookup is exact;
downgrading one step drops it, so the migration is reversible. There is no backfill —
sharing is a new capability, so a Session simply has no link until one is created.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SHARE_LINK = "0032_session_favorite"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'share_link_migration.db'}"
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
    """A Session row so the link's foreign key has a real target."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, "
                    "provenance, has_been_regenerated, created_at) "
                    "VALUES (1, 'owner_1', 'strength', 45, 'ai_generated', 0, "
                    "'2026-08-26 00:00:00')"
                )
            )
    finally:
        engine.dispose()


def _insert_link(url: str, token: str, session_id: int) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO share_link "
                    "(token, session_id, clerk_user_id, revoked_at, created_at) "
                    "VALUES (:token, :session, 'owner_1', NULL, "
                    "'2026-08-26 00:00:00')"
                ),
                {"token": token, "session": session_id},
            )
    finally:
        engine.dispose()


def test_upgrade_creates_the_share_link_table(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_SHARE_LINK)
    assert not _has_table(sqlite_url, "share_link")  # guard

    # Act
    command.upgrade(config, "0033_share_link")

    # Assert
    assert _has_table(sqlite_url, "share_link")


def test_token_is_unique(sqlite_url):
    # Arrange — the table plus a Session to reference
    config = _alembic_config()
    command.upgrade(config, "0033_share_link")
    _seed_session(sqlite_url)

    # Act — a first link inserts; a second row reusing the same token violates the unique index
    _insert_link(sqlite_url, "tok-abc", 1)

    # Assert — the token uniquely identifies a link (an exact preview/redeem lookup)
    with pytest.raises(IntegrityError):
        _insert_link(sqlite_url, "tok-abc", 1)


def test_downgrade_drops_the_share_link_table(sqlite_url):
    # Arrange — fully migrated with the table present
    config = _alembic_config()
    command.upgrade(config, "0033_share_link")

    # Act — step back over the migration
    command.downgrade(config, BEFORE_SHARE_LINK)

    # Assert — the table is gone again
    assert not _has_table(sqlite_url, "share_link")
