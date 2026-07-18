"""Migration test for the Superset grouping columns (issue #153, ADR-0023 Slice 1).

Exercises 0017 end to end against a real SQLite database: seed an
``exercise_prescription`` at the prior revision (before the columns existed),
upgrade over 0017, and assert the row gains a nullable ``superset_group`` and
``round_rest_seconds`` that both default to NULL — an existing flat Protocol reads
and deploys unchanged, ungrouped. Downgrading one step drops the columns again, so
the migration is reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SUPERSETS = "0016_protocol_name"
SUPERSETS = "0017_supersets"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'supersets_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_prescription(url: str) -> None:
    """Insert a flat Prescription as it existed before the Superset columns."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise_prescription "
                    "(id, session_id, exercise_id, position, sets, reps) "
                    "VALUES (1, 1, 1, 0, 3, '5')"
                )
            )
    finally:
        engine.dispose()


def _grouping(url: str, row_id: int) -> tuple[object, object]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT superset_group, round_rest_seconds "
                    "FROM exercise_prescription WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.superset_group, row.round_rest_seconds
    finally:
        engine.dispose()


def _has_columns(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = {
                column.name
                for column in conn.execute(
                    text("PRAGMA table_info(exercise_prescription)")
                ).all()
            }
        return {"superset_group", "round_rest_seconds"} <= columns
    finally:
        engine.dispose()


def test_upgrade_adds_nullable_superset_columns_defaulting_to_null(sqlite_url):
    # Arrange — a Prescription from before the Superset columns existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_SUPERSETS)
    _seed_prescription(sqlite_url)

    # Act — run the Supersets migration
    command.upgrade(config, SUPERSETS)

    # Assert — both columns exist and the existing flat row is NULL/NULL (ungrouped)
    assert _has_columns(sqlite_url)
    assert _grouping(sqlite_url, 1) == (None, None)


def test_downgrade_drops_the_superset_columns(sqlite_url):
    # Arrange — fully migrated with the columns present
    config = _alembic_config()
    command.upgrade(config, SUPERSETS)
    _seed_prescription(sqlite_url)

    # Act — step back over the Supersets migration
    command.downgrade(config, BEFORE_SUPERSETS)

    # Assert — the columns are gone again
    assert not _has_columns(sqlite_url)
