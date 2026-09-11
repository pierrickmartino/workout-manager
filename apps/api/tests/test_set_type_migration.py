"""Migration test for the Set Type columns (ADR-0065, #449).

Exercises 0038 end to end against a real SQLite database: the additive, nullable
``set_type`` column arrives on **both** ``exercise_prescription`` (plan) and ``logged_set``
(record) with existing rows reading NULL (unset → working, exactly as before), a value can
be written to each, and the downgrade drops both cleanly while leaving the base
reps/load/quantity columns untouched. Purely additive: reversible with no data loss."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SET_TYPE = "0037_logged_session_idempotency_key"
SET_TYPE_REVISION = "0038_set_type"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'set_type_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_rows(url: str) -> None:
    """Insert a prescription and a logged set at the pre-set-type revision (no column yet),
    so the upgrade proves it leaves existing rows reading NULL and untouched."""

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
            conn.execute(
                text(
                    "INSERT INTO logged_session "
                    "(id, clerk_user_id, session_id, training_type, performed_on, "
                    "created_at) "
                    "VALUES (1, 'user_1', 1, 'strength', '2026-09-03', "
                    "'2026-09-03T00:00:00')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO logged_set "
                    "(id, logged_session_id, exercise_id, position) "
                    "VALUES (1, 1, 1, 0)"
                )
            )
    finally:
        engine.dispose()


def _column_names(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).all()
        return {row[1] for row in rows}
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_set_type_to_both_tables_defaulting_to_null(sqlite_url):
    # Arrange — rows as they existed before the set_type column
    config = _alembic_config()
    command.upgrade(config, BEFORE_SET_TYPE)
    _seed_rows(sqlite_url)

    # Act — run the set-type migration
    command.upgrade(config, SET_TYPE_REVISION)

    # Assert — the column exists on both tables and existing rows read NULL (unset → working)
    assert "set_type" in _column_names(sqlite_url, "exercise_prescription")
    assert "set_type" in _column_names(sqlite_url, "logged_set")
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            plan_value = conn.execute(
                text("SELECT set_type FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
            record_value = conn.execute(
                text("SELECT set_type FROM logged_set WHERE id = 1")
            ).scalar_one()
        assert plan_value is None
        assert record_value is None
    finally:
        engine.dispose()


def test_a_set_type_can_be_written_on_both_sides_after_the_upgrade(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_SET_TYPE)
    _seed_rows(sqlite_url)
    command.upgrade(config, SET_TYPE_REVISION)

    # Act — write a plan-side and a record-side annotation, then read both back
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription SET set_type = 'warm_up' WHERE id = 1"
                )
            )
            conn.execute(
                text("UPDATE logged_set SET set_type = 'amrap' WHERE id = 1")
            )
        with engine.connect() as conn:
            plan_value = conn.execute(
                text("SELECT set_type FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
            record_value = conn.execute(
                text("SELECT set_type FROM logged_set WHERE id = 1")
            ).scalar_one()
    finally:
        engine.dispose()

    # Assert
    assert plan_value == "warm_up"
    assert record_value == "amrap"


def test_downgrade_drops_both_columns_and_keeps_base_data(sqlite_url):
    # Arrange — fully migrated with a set type written on each side
    config = _alembic_config()
    command.upgrade(config, BEFORE_SET_TYPE)
    _seed_rows(sqlite_url)
    command.upgrade(config, SET_TYPE_REVISION)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription SET set_type = 'drop' WHERE id = 1"
                )
            )
            conn.execute(
                text("UPDATE logged_set SET set_type = 'failure' WHERE id = 1")
            )
    finally:
        engine.dispose()

    # Act — step back over the migration
    command.downgrade(config, BEFORE_SET_TYPE)

    # Assert — the additive columns are gone; base reps survives untouched
    assert "set_type" not in _column_names(sqlite_url, "exercise_prescription")
    assert "set_type" not in _column_names(sqlite_url, "logged_set")
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            reps = conn.execute(
                text("SELECT reps FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
        assert reps == "8-12"
    finally:
        engine.dispose()
