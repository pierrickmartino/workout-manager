"""Migration test for the Pinned-Target column (issue #369, ADR-0053).

Exercises 0028 end to end against a real SQLite database: the additive, nullable
``pinned_reps`` column arrives on ``exercise_prescription`` with existing rows reading NULL
(no pin — automatic Progression governs, exactly as before), a value can be written to it,
and the downgrade drops it cleanly while leaving the base ``reps`` target it suspends
untouched. Purely additive: reversible in both directions with no data loss."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_PIN = "0027_prescribed_quantity"
PIN_REVISION = "0028_pin_rep_target"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'pin_rep_target_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_prescription(url: str) -> None:
    """Insert a prescription at the pre-pin revision (no pinned_reps column yet)."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise_prescription "
                    "(id, session_id, exercise_id, position, sets, reps) "
                    "VALUES (1, 1, 1, 0, 3, '8-12')"
                )
            )
    finally:
        engine.dispose()


def _column_names(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("PRAGMA table_info(exercise_prescription)")
            ).all()
        return {row[1] for row in rows}
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_pinned_reps_defaulting_to_null(sqlite_url):
    # Arrange — a prescription as it existed before the Pin feature
    config = _alembic_config()
    command.upgrade(config, BEFORE_PIN)
    _seed_prescription(sqlite_url)

    # Act — run the Pin migration
    command.upgrade(config, PIN_REVISION)

    # Assert — the column exists and the existing row reads NULL (no pin)
    assert "pinned_reps" in _column_names(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            value = conn.execute(
                text("SELECT pinned_reps FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
        assert value is None
    finally:
        engine.dispose()


def test_a_pin_can_be_written_after_the_upgrade(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_PIN)
    _seed_prescription(sqlite_url)
    command.upgrade(config, PIN_REVISION)

    # Act — write a pinned target, then read it back
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription SET pinned_reps = '10-14' WHERE id = 1"
                )
            )
        with engine.connect() as conn:
            value = conn.execute(
                text("SELECT pinned_reps FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
    finally:
        engine.dispose()

    # Assert
    assert value == "10-14"


def test_downgrade_drops_the_column_and_keeps_reps(sqlite_url):
    # Arrange — fully migrated with a pin written
    config = _alembic_config()
    command.upgrade(config, BEFORE_PIN)
    _seed_prescription(sqlite_url)
    command.upgrade(config, PIN_REVISION)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription SET pinned_reps = '10-14' WHERE id = 1"
                )
            )
    finally:
        engine.dispose()

    # Act — step back over the migration
    command.downgrade(config, BEFORE_PIN)

    # Assert — the additive column is gone; the base rep target it suspended is untouched
    columns = _column_names(sqlite_url)
    assert "pinned_reps" not in columns
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            reps = conn.execute(
                text("SELECT reps FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
        assert reps == "8-12"
    finally:
        engine.dispose()
