"""Migration test for the Protocol ``calibration`` column (ADR-0111).

Exercises 0044 end to end against a real SQLite database: seed a Protocol at the prior
revision (before the column existed), upgrade over 0044, and assert the row gains a nullable
``calibration`` that defaults to NULL — an existing Protocol has never been calibrated, and
NULL reads as 0, "as authored", with no backfill (the same pattern as the Protocol's ``name``
in 0016). Downgrading one step drops the column again, so the migration is reversible.

The column stores the user's *intent*, not the re-pitched values: those are materialised onto
the un-performed Prescription rows (ADR-0111), so this is what the ±3 clamp clamps, what a
second nudge stacks onto, and what the later Fitness Level fold reads.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_CALIBRATION = "0043_exercise_image_upload"
CALIBRATION = "0044_protocol_calibration"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'protocol_calibration_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_protocol(url: str) -> None:
    """Insert a Protocol as it existed before the ``calibration`` column."""

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
    finally:
        engine.dispose()


def _calibration(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT calibration AS value FROM protocol WHERE id = :id"),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_calibration_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(protocol)")).all()
        return any(column.name == "calibration" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_calibration_defaulting_to_null(sqlite_url):
    # Arrange — a Protocol from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_CALIBRATION)
    _seed_protocol(sqlite_url)

    # Act — run the Calibration migration
    command.upgrade(config, CALIBRATION)

    # Assert — the column exists and the existing row is NULL (never calibrated)
    assert _has_calibration_column(sqlite_url)
    assert _calibration(sqlite_url, 1) is None


def test_the_column_accepts_a_negative_offset(sqlite_url):
    """The offset is signed: an easier re-pitch stores below zero, so a column that
    quietly refused negatives would make half the feature unwritable."""

    # Arrange
    config = _alembic_config()
    command.upgrade(config, CALIBRATION)
    _seed_protocol(sqlite_url)

    # Act
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(text("UPDATE protocol SET calibration = -3 WHERE id = 1"))
    finally:
        engine.dispose()

    # Assert
    assert _calibration(sqlite_url, 1) == -3


def test_downgrade_drops_the_calibration_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, CALIBRATION)
    _seed_protocol(sqlite_url)

    # Act — step back over the Calibration migration
    command.downgrade(config, BEFORE_CALIBRATION)

    # Assert — the column is gone again
    assert not _has_calibration_column(sqlite_url)
