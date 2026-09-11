"""Migration test for the Effort columns (ADR-0066, #450).

Exercises 0039 end to end against a real SQLite database: the additive, nullable JSON
``effort`` column arrives on ``logged_set`` (the record) and ``target_effort`` on
``exercise_prescription`` (the plan), existing rows read NULL (unset — no backfill), a
typed ``{scale, value}`` value can be written to each, and the downgrade drops both cleanly
while leaving the base reps and the retained ``perceived_difficulty`` int untouched. Purely
additive: reversible with no data loss."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_EFFORT = "0038_set_type"
EFFORT_REVISION = "0039_effort"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'effort_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_rows(url: str) -> None:
    """Insert a prescription and a logged set (with a legacy perceived_difficulty) at the
    pre-effort revision, so the upgrade proves it leaves existing rows reading NULL and the
    retained int untouched."""

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
                    "(id, logged_session_id, exercise_id, position, perceived_difficulty) "
                    "VALUES (1, 1, 1, 0, 8)"
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


def test_upgrade_adds_nullable_effort_columns_defaulting_to_null(sqlite_url):
    # Arrange — rows as they existed before the effort columns
    config = _alembic_config()
    command.upgrade(config, BEFORE_EFFORT)
    _seed_rows(sqlite_url)

    # Act — run the effort migration
    command.upgrade(config, EFFORT_REVISION)

    # Assert — the columns exist and existing rows read NULL (no backfill)…
    assert "target_effort" in _column_names(sqlite_url, "exercise_prescription")
    assert "effort" in _column_names(sqlite_url, "logged_set")
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            target = conn.execute(
                text("SELECT target_effort FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
            effort = conn.execute(
                text("SELECT effort FROM logged_set WHERE id = 1")
            ).scalar_one()
            # …and the retained legacy int is untouched (read later as rpe-scale Effort)
            legacy = conn.execute(
                text("SELECT perceived_difficulty FROM logged_set WHERE id = 1")
            ).scalar_one()
        assert target is None
        assert effort is None
        assert legacy == 8
    finally:
        engine.dispose()


def test_a_typed_effort_can_be_written_on_both_sides_after_the_upgrade(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_EFFORT)
    _seed_rows(sqlite_url)
    command.upgrade(config, EFFORT_REVISION)

    # Act — write a plan-side target and a record-side logged effort, then read both back
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription "
                    "SET target_effort = '{\"scale\": \"rpe\", \"value\": 8}' WHERE id = 1"
                )
            )
            conn.execute(
                text(
                    "UPDATE logged_set "
                    "SET effort = '{\"scale\": \"rir\", \"value\": 3}' WHERE id = 1"
                )
            )
        with engine.connect() as conn:
            target = conn.execute(
                text("SELECT target_effort FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
            effort = conn.execute(
                text("SELECT effort FROM logged_set WHERE id = 1")
            ).scalar_one()
    finally:
        engine.dispose()

    # Assert — the typed JSON value round-trips through the column
    assert '"scale": "rpe"' in target and '"value": 8' in target
    assert '"scale": "rir"' in effort and '"value": 3' in effort


def test_downgrade_drops_both_columns_and_keeps_base_data(sqlite_url):
    # Arrange — fully migrated with a typed effort written on each side
    config = _alembic_config()
    command.upgrade(config, BEFORE_EFFORT)
    _seed_rows(sqlite_url)
    command.upgrade(config, EFFORT_REVISION)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription "
                    "SET target_effort = '{\"scale\": \"rir\", \"value\": 2}' WHERE id = 1"
                )
            )
            conn.execute(
                text(
                    "UPDATE logged_set "
                    "SET effort = '{\"scale\": \"rpe\", \"value\": 6.5}' WHERE id = 1"
                )
            )
    finally:
        engine.dispose()

    # Act — step back over the migration
    command.downgrade(config, BEFORE_EFFORT)

    # Assert — the additive columns are gone; base reps and the retained int survive
    assert "target_effort" not in _column_names(sqlite_url, "exercise_prescription")
    assert "effort" not in _column_names(sqlite_url, "logged_set")
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            reps = conn.execute(
                text("SELECT reps FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
            legacy = conn.execute(
                text("SELECT perceived_difficulty FROM logged_set WHERE id = 1")
            ).scalar_one()
        assert reps == "8-12"
        assert legacy == 8
    finally:
        engine.dispose()
