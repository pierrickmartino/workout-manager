"""Migration test for dropping the ``trace_id`` lineage columns (issue #734).

The AI audit log keeps a Generation Call for 3 days (ADR-0135), so a lineage id stored on a
Protocol or Session would point at nothing within days. 0053 drops both columns. Exercised
against a real SQLite database: seed a Protocol and a WorkoutSession carrying a lineage id
at the prior revision, upgrade over 0053 and assert the columns are gone while the rows
survive; downgrading restores both columns as nullable, NULL for every row (the dropped
lineage is not recoverable).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_DROP = "0052_generation_call_detail"
AT_DROP = "0053_drop_trace_id"
LINEAGE_COLUMN = "trace_id"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'drop_trace_id_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _execute(url: str, statement: str) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text(statement))
    finally:
        engine.dispose()


def _seed_rows_with_lineage(url: str) -> None:
    """Insert a Protocol and a WorkoutSession that each carry a lineage id."""

    _execute(
        url,
        "INSERT INTO protocol "
        f"(id, clerk_user_id, training_type, objective, sessions_per_week, weeks, "
        f"duration_minutes, created_at, {LINEAGE_COLUMN}) "
        "VALUES (1, 'user_1', 'strength', 'gain muscle mass', 3, 4, 45, "
        "'2026-10-16 00:00:00', 'call-1')",
    )
    _execute(
        url,
        "INSERT INTO workout_session "
        f"(id, clerk_user_id, training_type, duration_minutes, created_at, "
        f"has_been_regenerated, {LINEAGE_COLUMN}) "
        "VALUES (1, 'user_1', 'strength', 45, '2026-10-16 00:00:00', 0, 'call-1')",
    )


def _columns(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).all()
        return {row.name for row in rows}
    finally:
        engine.dispose()


def _scalar(url: str, query: str) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(text(query)).scalar_one()
    finally:
        engine.dispose()


def test_upgrade_drops_lineage_columns_and_keeps_rows(sqlite_url):
    # Arrange — a Protocol and a Session carrying lineage before the drop
    config = _alembic_config()
    command.upgrade(config, BEFORE_DROP)
    _seed_rows_with_lineage(sqlite_url)

    # Act
    command.upgrade(config, AT_DROP)

    # Assert — the columns are gone, the rows are not
    assert LINEAGE_COLUMN not in _columns(sqlite_url, "protocol")
    assert LINEAGE_COLUMN not in _columns(sqlite_url, "workout_session")
    assert _scalar(sqlite_url, "SELECT objective FROM protocol WHERE id = 1") == (
        "gain muscle mass"
    )
    assert _scalar(sqlite_url, "SELECT COUNT(*) FROM workout_session") == 1


def test_downgrade_restores_nullable_lineage_columns(sqlite_url):
    # Arrange — fully migrated, a Protocol and a Session present
    config = _alembic_config()
    command.upgrade(config, BEFORE_DROP)
    _seed_rows_with_lineage(sqlite_url)
    command.upgrade(config, AT_DROP)

    # Act
    command.downgrade(config, BEFORE_DROP)

    # Assert — both columns are back and carry NULL: the dropped lineage is not recovered
    assert LINEAGE_COLUMN in _columns(sqlite_url, "protocol")
    assert LINEAGE_COLUMN in _columns(sqlite_url, "workout_session")
    assert _scalar(sqlite_url, f"SELECT {LINEAGE_COLUMN} FROM protocol WHERE id = 1") is None
    assert (
        _scalar(sqlite_url, f"SELECT {LINEAGE_COLUMN} FROM workout_session WHERE id = 1")
        is None
    )
