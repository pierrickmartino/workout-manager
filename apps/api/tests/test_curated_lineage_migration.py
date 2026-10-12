"""Migration test for the curated lineage columns (ADR-0130, issue #688).

Exercises 0048 against a real SQLite database: rows seeded at the prior revision gain
nullable ``curated_identifier``/``curated_version``/``curated_name`` columns that read NULL,
because every pre-existing plan came from a Generated Protocol or was authored by hand.
Downgrading one step drops the columns again."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE = "0047_protocol_made_current_at_nullable"
AT = "0048_curated_lineage"
TABLES = ("protocol", "workout_session")
COLUMNS = ("curated_identifier", "curated_version", "curated_name")


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'curated_lineage_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_rows(url: str) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO protocol "
                    "(id, clerk_user_id, training_type, objective, "
                    "sessions_per_week, weeks, duration_minutes, created_at) "
                    "VALUES (1, 'user_1', 'strength', 'gain muscle mass', 3, 4, 45, "
                    "'2026-10-01 00:00:00')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, created_at, "
                    "has_been_regenerated) "
                    "VALUES (1, 'user_1', 'strength', 45, '2026-10-01 00:00:00', 0)"
                )
            )
    finally:
        engine.dispose()


def _lineage_values(url: str, table: str) -> tuple:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return tuple(
                conn.execute(
                    text(f"SELECT {', '.join(COLUMNS)} FROM {table} WHERE id = 1")
                ).one()
            )
    finally:
        engine.dispose()


def _column_names(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return {c.name for c in conn.execute(text(f"PRAGMA table_info({table})"))}
    finally:
        engine.dispose()


def test_upgrade_adds_nullable_lineage_columns_reading_null_on_existing_rows(sqlite_url):
    # Arrange
    config = _config()
    command.upgrade(config, BEFORE)
    _seed_rows(sqlite_url)

    # Act
    command.upgrade(config, AT)

    # Assert
    for table in TABLES:
        assert _lineage_values(sqlite_url, table) == (None, None, None)


def test_downgrade_drops_the_lineage_columns(sqlite_url):
    # Arrange
    config = _config()
    command.upgrade(config, AT)

    # Act
    command.downgrade(config, BEFORE)

    # Assert
    for table in TABLES:
        assert not set(COLUMNS) & _column_names(sqlite_url, table)
