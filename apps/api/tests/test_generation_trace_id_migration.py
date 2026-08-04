"""Migration test for the Generation Call ``trace_id`` columns (ADR-0039, #274).

Exercises 0022 end to end against a real SQLite database: seed a Protocol and a
WorkoutSession at the prior revision (before the columns existed), upgrade over 0022,
and assert both rows gain a nullable ``trace_id`` that defaults to NULL — a deployment
with no monitoring backend records no lineage and every pre-migration row simply carries
NULL, no backfill. Downgrading one step drops both columns again, so the migration is
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
BEFORE_TRACE_ID = "0021_plan_less_logged_session"
AT_TRACE_ID = "0022_generation_trace_id"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'trace_id_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_rows(url: str) -> None:
    """Insert a Protocol and a WorkoutSession as they existed before the columns."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO protocol "
                    "(id, clerk_user_id, training_type, objective, "
                    "sessions_per_week, weeks, duration_minutes, created_at) "
                    "VALUES (1, 'user_1', 'strength', 'gain muscle mass', 3, 4, 45, "
                    "'2026-08-04 00:00:00')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, created_at, "
                    "has_been_regenerated) "
                    "VALUES (1, 'user_1', 'strength', 45, '2026-08-04 00:00:00', 0)"
                )
            )
    finally:
        engine.dispose()


def _trace_id(url: str, table: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(f"SELECT trace_id AS value FROM {table} WHERE id = :id"),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_trace_id_column(url: str, table: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text(f"PRAGMA table_info({table})")).all()
        return any(column.name == "trace_id" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_nullable_trace_id_defaulting_to_null(sqlite_url):
    # Arrange — Protocol and Session rows from before the columns existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_TRACE_ID)
    _seed_rows(sqlite_url)

    # Act — run the trace-id lineage migration
    command.upgrade(config, AT_TRACE_ID)

    # Assert — both columns now exist and the existing rows carry NULL (no backfill)
    assert _has_trace_id_column(sqlite_url, "protocol")
    assert _has_trace_id_column(sqlite_url, "workout_session")
    assert _trace_id(sqlite_url, "protocol", 1) is None
    assert _trace_id(sqlite_url, "workout_session", 1) is None


def test_downgrade_drops_both_trace_id_columns(sqlite_url):
    # Arrange — fully migrated with both columns present
    config = _alembic_config()
    command.upgrade(config, AT_TRACE_ID)
    _seed_rows(sqlite_url)

    # Act — step back over the trace-id lineage migration
    command.downgrade(config, BEFORE_TRACE_ID)

    # Assert — both columns are gone again
    assert not _has_trace_id_column(sqlite_url, "protocol")
    assert not _has_trace_id_column(sqlite_url, "workout_session")
