"""Migration test for the default rest-timer column (issue #121, F5 Slice 4).

Exercises 0015 end to end against a real SQLite database: seed a Profile at the
prior revision (before the column existed), upgrade over 0015, and assert the row
gains a nullable ``default_rest_seconds`` that defaults to NULL — an existing user
who never set a default is unaffected and falls back to the prescription's own
rest. Downgrading one step drops the column again, so the migration is reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_REST = "0014_muscle_emphasis_split"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'rest_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_profile(url: str) -> None:
    """Insert a Profile as it existed before the default rest-timer column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO profile "
                    "(id, clerk_user_id, default_equipment, fitness_levels, "
                    "preferences, sensitive_constraints) "
                    "VALUES (1, 'user_1', '[]', '{}', '[]', '[]')"
                )
            )
    finally:
        engine.dispose()


def _default_rest(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT default_rest_seconds AS value FROM profile "
                    "WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_default_rest_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(profile)")).all()
        return any(column.name == "default_rest_seconds" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_default_rest_seconds_defaulting_to_null(sqlite_url):
    # Arrange — a Profile from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_REST)
    _seed_profile(sqlite_url)

    # Act — run the default rest-timer migration
    command.upgrade(config, "0015_default_rest_seconds")

    # Assert — the column now exists and the existing row is NULL (unset)
    assert _has_default_rest_column(sqlite_url)
    assert _default_rest(sqlite_url, 1) is None


def test_downgrade_drops_the_default_rest_seconds_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0015_default_rest_seconds")
    _seed_profile(sqlite_url)

    # Act — step back over the default rest-timer migration
    command.downgrade(config, BEFORE_REST)

    # Assert — the column is gone again
    assert not _has_default_rest_column(sqlite_url)
