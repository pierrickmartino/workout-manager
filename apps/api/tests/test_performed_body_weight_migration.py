"""Migration test for the Performed Body Weight column (issue #196, ADR-0026).

Exercises 0018 end to end against a real SQLite database: seed a Logged Set at the
prior revision (before the column existed), upgrade over 0018, and assert the row
gains a nullable ``body_weight_kg`` that defaults to NULL — a set logged before the
snapshot shipped keeps no Performed Body Weight (no backfill), so it stays outside
strength records rather than being resolved against a guessed mass. Downgrading one
step drops the column again, so the migration is reversible."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_BODY_WEIGHT = "0017_supersets"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'body_weight_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_logged_set(url: str) -> None:
    """Insert a Logged Session + Set as they existed before the column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO logged_session "
                    "(id, clerk_user_id, session_id, performed_on, created_at) "
                    "VALUES (1, 'user_1', 1, '2026-06-20', '2026-06-20 00:00:00')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO logged_set "
                    "(id, logged_session_id, exercise_id, position, reps, load) "
                    "VALUES (1, 1, 1, 0, 8, NULL)"
                )
            )
    finally:
        engine.dispose()


def _body_weight(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT body_weight_kg AS value FROM logged_set WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_body_weight_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(logged_set)")).all()
        return any(column.name == "body_weight_kg" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_body_weight_defaulting_to_null(sqlite_url):
    # Arrange — a Logged Set from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_BODY_WEIGHT)
    _seed_logged_set(sqlite_url)

    # Act — run the Performed Body Weight migration
    command.upgrade(config, "0018_performed_body_weight")

    # Assert — the column exists and the pre-existing row is untouched (NULL, no backfill)
    assert _has_body_weight_column(sqlite_url)
    assert _body_weight(sqlite_url, 1) is None


def test_downgrade_drops_the_body_weight_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0018_performed_body_weight")
    _seed_logged_set(sqlite_url)

    # Act — step back over the Performed Body Weight migration
    command.downgrade(config, BEFORE_BODY_WEIGHT)

    # Assert — the column is gone again
    assert not _has_body_weight_column(sqlite_url)
