"""Migration test for the Program→Protocol rename (issue #45).

Exercises the 0009 rename end to end against a real SQLite database: upgrading to
head must leave a ``protocol`` table and a ``workout_session.protocol_id`` FK
column (with its index) and no trace of the old ``program`` names, while
``downgrade`` one step must restore the original ``program``/``program_id`` names
cleanly. Guards that the rename is reversible in both directions."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_RENAME = "0008_metric_history"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic.

    Alembic's ``env.py`` reads the URL from ``get_settings()``; point it at a temp
    file and clear the settings cache so the migration runs against SQLite, not
    the default Postgres URL. The cache is cleared again on teardown so other
    tests see the real settings.
    """

    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _table_names(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def _column_names(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        return {col["name"] for col in inspect(engine).get_columns(table)}
    finally:
        engine.dispose()


def _index_names(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        return {idx["name"] for idx in inspect(engine).get_indexes(table)}
    finally:
        engine.dispose()


def test_upgrade_renames_program_to_protocol(sqlite_url):
    # Act
    command.upgrade(_alembic_config(), "head")

    # Assert — the table and its FK column now use Protocol names
    tables = _table_names(sqlite_url)
    assert "protocol" in tables
    assert "program" not in tables

    session_columns = _column_names(sqlite_url, "workout_session")
    assert "protocol_id" in session_columns
    assert "program_id" not in session_columns

    assert "ix_workout_session_protocol_id" in _index_names(
        sqlite_url, "workout_session"
    )
    assert "ix_protocol_clerk_user_id" in _index_names(sqlite_url, "protocol")


def test_downgrade_restores_program_names(sqlite_url):
    # Arrange — fully upgraded to Protocol names
    config = _alembic_config()
    command.upgrade(config, "head")

    # Act — step back over the rename only
    command.downgrade(config, BEFORE_RENAME)

    # Assert — the original Program names are restored cleanly
    tables = _table_names(sqlite_url)
    assert "program" in tables
    assert "protocol" not in tables

    session_columns = _column_names(sqlite_url, "workout_session")
    assert "program_id" in session_columns
    assert "protocol_id" not in session_columns

    assert "ix_workout_session_program_id" in _index_names(
        sqlite_url, "workout_session"
    )
    assert "ix_program_clerk_user_id" in _index_names(sqlite_url, "program")
