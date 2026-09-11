"""Migration test for Pin's retirement (ADR-0064, #434).

Exercises 0036 end to end against a real SQLite database — the *contract* step that
replaces the Pin rep-target migration (0028). A Prescription still carrying a Pinned
Target is migrated to preserve intent exactly: its base ``reps`` becomes the pinned
value and its ``scheme`` becomes ``static`` (nothing auto-steps it). An unpinned
Prescription is untouched and keeps its null scheme (the default Double Progression).
The now-dead ``pinned_reps`` column no longer exists after the upgrade.

This test replaces ``test_pin_rep_target_migration``."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_RETIRE = "0035_prescription_scheme"
RETIRE_REVISION = "0036_retire_pin"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'pin_retirement_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_prescriptions(url: str) -> None:
    """Seed three prescriptions at the pre-retirement revision (pinned_reps still present):
    a pinned one, an unpinned one, and one with a blank marker (treated as unpinned)."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise_prescription "
                    "(id, session_id, exercise_id, position, sets, reps, pinned_reps, scheme) "
                    "VALUES "
                    "(1, 1, 1, 0, 3, '8-12', '10-14', NULL), "
                    "(2, 1, 2, 1, 3, '5', NULL, NULL), "
                    "(3, 1, 3, 2, 3, '6-10', '  ', NULL)"
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


def _row(url: str, prescription_id: int) -> tuple[str, str | None]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(
                text(
                    "SELECT reps, scheme FROM exercise_prescription WHERE id = :id"
                ),
                {"id": prescription_id},
            ).one()
    finally:
        engine.dispose()


def test_a_pinned_prescription_migrates_to_reps_plus_static(sqlite_url):
    # Arrange — prescriptions as they existed with the Pin column still present
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_prescriptions(sqlite_url)

    # Act — run the retirement migration
    command.upgrade(config, RETIRE_REVISION)

    # Assert — the pinned target became the base reps and the scheme became static
    reps, scheme = _row(sqlite_url, 1)
    assert reps == "10-14"
    assert scheme == "static"


def test_an_unpinned_prescription_keeps_its_reps_and_null_scheme(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_prescriptions(sqlite_url)

    # Act
    command.upgrade(config, RETIRE_REVISION)

    # Assert — untouched: the base reps stand and the scheme stays null (default engine)
    reps, scheme = _row(sqlite_url, 2)
    assert reps == "5"
    assert scheme is None


def test_a_blank_marker_is_treated_as_unpinned(sqlite_url):
    # Arrange — a whitespace-only pinned_reps was never a real pin (the web trimmed it)
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_prescriptions(sqlite_url)

    # Act
    command.upgrade(config, RETIRE_REVISION)

    # Assert — left untouched, not migrated to static
    reps, scheme = _row(sqlite_url, 3)
    assert reps == "6-10"
    assert scheme is None


def test_the_upgrade_drops_the_pinned_reps_column(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_prescriptions(sqlite_url)

    # Act
    command.upgrade(config, RETIRE_REVISION)

    # Assert — the now-dead column is gone; the scheme column remains
    columns = _column_names(sqlite_url)
    assert "pinned_reps" not in columns
    assert "scheme" in columns


def test_downgrade_restores_the_column(sqlite_url):
    # Arrange — fully migrated
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_prescriptions(sqlite_url)
    command.upgrade(config, RETIRE_REVISION)

    # Act — step back over the migration
    command.downgrade(config, BEFORE_RETIRE)

    # Assert — the additive column is restored (all NULL); the migrated data is not reversed
    columns = _column_names(sqlite_url)
    assert "pinned_reps" in columns
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            reps, pinned, scheme = conn.execute(
                text(
                    "SELECT reps, pinned_reps, scheme FROM exercise_prescription WHERE id = 1"
                )
            ).one()
    finally:
        engine.dispose()
    assert reps == "10-14"
    assert pinned is None
    assert scheme == "static"
