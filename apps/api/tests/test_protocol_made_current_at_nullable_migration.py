"""Migration test for the nullable Protocol ``made_current_at`` (issue #687, ADR-0130).

Runs 0047 against a real SQLite database: after the upgrade a Protocol may be stored with no
made-Current stamp (adopted set aside) while existing stamps are kept, and the downgrade
backfills a missing stamp from ``created_at`` before restoring the constraint."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_NULLABLE = "0046_seed_curated_exercises"
NULLABLE = "0047_protocol_made_current_at_nullable"
CREATED_AT = "2026-01-01 08:00:00"
MADE_CURRENT_AT = "2026-02-01 08:00:00"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'made_current_at_nullable.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _insert(url: str, protocol_id: int, made_current_at: str | None) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO protocol "
                    "(id, clerk_user_id, training_type, objective, sessions_per_week, "
                    "weeks, duration_minutes, created_at, made_current_at) "
                    "VALUES (:id, 'user_a', 'strength', 'gain muscle mass', 1, 1, 45, "
                    ":created_at, :made_current_at)"
                ),
                {
                    "id": protocol_id,
                    "created_at": CREATED_AT,
                    "made_current_at": made_current_at,
                },
            )
    finally:
        engine.dispose()


def _stamps(url: str) -> dict[int, str | None]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, made_current_at FROM protocol")).all()
    finally:
        engine.dispose()
    return {row.id: row.made_current_at for row in rows}


def test_upgrade_lets_a_protocol_be_stored_never_made_current_and_keeps_stamps(sqlite_url):
    # Arrange
    command.upgrade(_config(), BEFORE_NULLABLE)
    _insert(sqlite_url, 1, MADE_CURRENT_AT)

    # Act
    command.upgrade(_config(), NULLABLE)
    _insert(sqlite_url, 2, None)

    # Assert
    stamps = _stamps(sqlite_url)
    assert stamps[1].startswith("2026-02-01 08:00:00")
    assert stamps[2] is None


def test_downgrade_backfills_a_missing_stamp_from_created_at(sqlite_url):
    # Arrange
    command.upgrade(_config(), NULLABLE)
    _insert(sqlite_url, 1, None)

    # Act
    command.downgrade(_config(), BEFORE_NULLABLE)

    # Assert
    assert _stamps(sqlite_url)[1].startswith("2026-01-01 08:00:00")
