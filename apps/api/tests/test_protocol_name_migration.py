"""Migration test for the Protocol ``name`` column (issue #132, F4 Slice 5).

Exercises 0016 end to end against a real SQLite database: seed a Protocol at the
prior revision (before the column existed), upgrade over 0016, and assert the row
gains a nullable ``name`` that defaults to NULL — an existing adopted Protocol that
was never named reads through its derived ``objective · training_type`` label with
no backfill. Downgrading one step drops the column again, so the migration is
reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_NAME = "0015_default_rest_seconds"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'protocol_name_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_protocol(url: str) -> None:
    """Insert a Protocol as it existed before the ``name`` column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO protocol "
                    "(id, clerk_user_id, training_type, objective, "
                    "sessions_per_week, weeks, duration_minutes, created_at) "
                    "VALUES (1, 'user_1', 'strength', 'gain muscle mass', 3, 4, 45, "
                    "'2026-07-10 00:00:00')"
                )
            )
    finally:
        engine.dispose()


def _name(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT name AS value FROM protocol WHERE id = :id"),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_name_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(protocol)")).all()
        return any(column.name == "name" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_name_defaulting_to_null(sqlite_url):
    # Arrange — a Protocol from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_NAME)
    _seed_protocol(sqlite_url)

    # Act — run the Protocol name migration
    command.upgrade(config, "0016_protocol_name")

    # Assert — the column now exists and the existing row is NULL (unnamed)
    assert _has_name_column(sqlite_url)
    assert _name(sqlite_url, 1) is None


def test_downgrade_drops_the_name_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0016_protocol_name")
    _seed_protocol(sqlite_url)

    # Act — step back over the Protocol name migration
    command.downgrade(config, BEFORE_NAME)

    # Assert — the column is gone again
    assert not _has_name_column(sqlite_url)
