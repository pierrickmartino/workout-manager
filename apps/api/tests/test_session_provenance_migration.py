"""Migration test for the Session Provenance column (CONTEXT.md, ADR-0040).

Exercises 0023 end to end against a real SQLite database: seed a WorkoutSession at the
prior revision (before the column existed), upgrade over 0023, and assert the row gains a
non-null ``provenance`` backfilled to ``ai_generated`` — every Session that exists today
was AI-produced, so the server default backfills every pre-migration row rather than
leaving it NULL. Downgrading one step drops the column again, so the migration is
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
BEFORE_PROVENANCE = "0022_generation_trace_id"
AT_PROVENANCE = "0023_session_provenance"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'provenance_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_session(url: str) -> None:
    """Insert a WorkoutSession as it existed before the provenance column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, created_at, "
                    "has_been_regenerated) "
                    "VALUES (1, 'user_1', 'strength', 45, '2026-08-07 00:00:00', 0)"
                )
            )
    finally:
        engine.dispose()


def _provenance(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT provenance AS value FROM workout_session WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_provenance_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(
                text("PRAGMA table_info(workout_session)")
            ).all()
        return any(column.name == "provenance" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_backfills_existing_sessions_to_ai_generated(sqlite_url):
    # Arrange — a Session row from before the provenance column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_PROVENANCE)
    _seed_session(sqlite_url)

    # Act — run the Session Provenance migration
    command.upgrade(config, AT_PROVENANCE)

    # Assert — the column exists and the pre-existing row is backfilled to ai_generated
    assert _has_provenance_column(sqlite_url)
    assert _provenance(sqlite_url, 1) == "ai_generated"


def test_downgrade_drops_the_provenance_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, AT_PROVENANCE)
    _seed_session(sqlite_url)

    # Act — step back over the Session Provenance migration
    command.downgrade(config, BEFORE_PROVENANCE)

    # Assert — the column is gone again
    assert not _has_provenance_column(sqlite_url)
