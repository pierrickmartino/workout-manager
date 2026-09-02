"""Migration test for the Logged Session idempotency key (issue #410, ADR-0060).

Exercises 0037 end to end against a real SQLite database. Seed a Logged Session at the
prior revision (before the column existed), upgrade over 0037, and assert the row gains a
nullable ``idempotency_key`` that defaults to NULL — a historical performance carries no
key and is untouched. The uniqueness is a UNIQUE index that **permits multiple NULLs**
(so keyless rows never collide) while rejecting a duplicate *present* key (the dedupe
identity that makes a retry safe). Downgrading one step drops the index and the column,
so the migration is reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_IDEMPOTENCY = "0036_retire_pin"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'idempotency_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_legacy_logged_session(url: str, row_id: int) -> None:
    """Insert a Logged Session as it existed *before* the idempotency-key column."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO logged_session "
                    "(id, clerk_user_id, session_id, training_type, performed_on, "
                    "created_at) "
                    "VALUES (:id, 'user_1', 1, 'strength', '2026-06-20', "
                    "'2026-06-20 00:00:00')"
                ),
                {"id": row_id},
            )
    finally:
        engine.dispose()


def _seed_logged_session(url: str, row_id: int, key: str | None) -> None:
    """Insert a Logged Session, optionally carrying an idempotency key."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO logged_session "
                    "(id, clerk_user_id, idempotency_key, session_id, training_type, "
                    "performed_on, created_at) "
                    "VALUES (:id, 'user_1', :key, 1, 'strength', '2026-06-20', "
                    "'2026-06-20 00:00:00')"
                ),
                {"id": row_id, "key": key},
            )
    finally:
        engine.dispose()


def _key(url: str, row_id: int) -> object:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT idempotency_key AS value FROM logged_session WHERE id = :id"
                ),
                {"id": row_id},
            ).one()
        return row.value
    finally:
        engine.dispose()


def _has_idempotency_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(logged_session)")).all()
        return any(column.name == "idempotency_key" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_adds_a_nullable_idempotency_key_defaulting_to_null(sqlite_url):
    # Arrange — a Logged Session from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_IDEMPOTENCY)
    _seed_legacy_logged_session(sqlite_url, row_id=1)

    # Act — run the idempotency-key migration
    command.upgrade(config, "0037_logged_session_idempotency_key")

    # Assert — the column now exists and the historical row is NULL (keyless, untouched)
    assert _has_idempotency_column(sqlite_url)
    assert _key(sqlite_url, 1) is None


def test_multiple_null_keys_are_permitted(sqlite_url):
    # Arrange — the migrated schema
    config = _alembic_config()
    command.upgrade(config, "0037_logged_session_idempotency_key")

    # Act — two keyless rows (both NULL) coexist under the unique index
    _seed_logged_session(sqlite_url, row_id=1, key=None)
    _seed_logged_session(sqlite_url, row_id=2, key=None)

    # Assert — NULLs are distinct, so historical/keyless rows never collide
    assert _key(sqlite_url, 1) is None
    assert _key(sqlite_url, 2) is None


def test_a_duplicate_present_key_is_rejected(sqlite_url):
    # Arrange — the migrated schema with one keyed finish
    config = _alembic_config()
    command.upgrade(config, "0037_logged_session_idempotency_key")
    _seed_logged_session(sqlite_url, row_id=1, key="finish-key-1")

    # Act / Assert — a second row reusing the same present key violates the unique index,
    # which is the server-side guard that a retry can never land as a second record
    with pytest.raises(IntegrityError):
        _seed_logged_session(sqlite_url, row_id=2, key="finish-key-1")


def test_downgrade_drops_the_idempotency_key_column(sqlite_url):
    # Arrange — fully migrated with the column present
    config = _alembic_config()
    command.upgrade(config, "0037_logged_session_idempotency_key")

    # Act — step back over the migration
    command.downgrade(config, BEFORE_IDEMPOTENCY)

    # Assert — the column is gone again
    assert not _has_idempotency_column(sqlite_url)
