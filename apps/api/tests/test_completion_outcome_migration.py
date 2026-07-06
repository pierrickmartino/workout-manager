"""Migration test for the Completion Outcome column (issue #87, ADR-0013).

Exercises 0011 end to end against a real SQLite database: seed a Logged Session at
the prior revision (before the column existed), upgrade over 0011, and assert the
row gains a nullable ``completion_outcome`` that defaults to NULL — an existing
performance is neither Completed nor Incomplete until re-declared, and a NULL never
holds a Session back from advancing. Downgrading one step drops the column again,
so the migration is reversible."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_OUTCOME = "0010_typed_load"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'completion_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_logged_session(url: str) -> None:
    """Insert a Logged Session as it existed before the Completion Outcome column."""

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
    finally:
        engine.dispose()


def _outcome(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT completion_outcome AS value FROM logged_session "
                    "WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_outcome_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(logged_session)")).all()
        return any(column.name == "completion_outcome" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_completion_outcome_defaulting_to_null(sqlite_url):
    # Arrange — a Logged Session from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_OUTCOME)
    _seed_logged_session(sqlite_url)

    # Act — run the Completion Outcome migration
    command.upgrade(config, "0011_completion_outcome")

    # Assert — the column now exists and the existing row is NULL (undeclared)
    assert _has_outcome_column(sqlite_url)
    assert _outcome(sqlite_url, 1) is None


def test_downgrade_drops_the_completion_outcome_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0011_completion_outcome")
    _seed_logged_session(sqlite_url)

    # Act — step back over the Completion Outcome migration
    command.downgrade(config, BEFORE_OUTCOME)

    # Assert — the column is gone again
    assert not _has_outcome_column(sqlite_url)
