"""Migration test for the per-Prescription Progression Scheme column (ADR-0064, #429).

Exercises 0035 end to end against a real SQLite database: the additive, nullable
``scheme`` column arrives on ``exercise_prescription`` with existing rows reading NULL
(no choice — the default Double Progression governs, exactly as before), a value can be
written to it, and the downgrade drops it cleanly while leaving the base ``reps`` /
``pinned_reps`` columns untouched. This is the *expand* step: ``pinned_reps`` keeps
working alongside the new column (Pin is retired later, #434). Purely additive:
reversible in both directions with no data loss."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SCHEME = "0034_weight_unit"
SCHEME_REVISION = "0035_prescription_scheme"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'prescription_scheme_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_prescription(url: str) -> None:
    """Insert a prescription at the pre-scheme revision (no scheme column yet), carrying a
    pin — proving the expand step leaves the existing Pin column and data intact."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise_prescription "
                    "(id, session_id, exercise_id, position, sets, reps, pinned_reps) "
                    "VALUES (1, 1, 1, 0, 3, '8-12', '10-14')"
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


def test_upgrade_adds_a_nullable_scheme_defaulting_to_null(sqlite_url):
    # Arrange — a prescription as it existed before the scheme column
    config = _alembic_config()
    command.upgrade(config, BEFORE_SCHEME)
    _seed_prescription(sqlite_url)

    # Act — run the scheme migration
    command.upgrade(config, SCHEME_REVISION)

    # Assert — the column exists and the existing row reads NULL (no choice → default)
    assert "scheme" in _column_names(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            value = conn.execute(
                text("SELECT scheme FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
        assert value is None
    finally:
        engine.dispose()


def test_the_upgrade_leaves_the_existing_pin_data_untouched(sqlite_url):
    # Arrange — a pinned row seeded before the scheme column
    config = _alembic_config()
    command.upgrade(config, BEFORE_SCHEME)
    _seed_prescription(sqlite_url)

    # Act — the expand step adds the scheme column alongside Pin
    command.upgrade(config, SCHEME_REVISION)

    # Assert — the existing pin (and the base reps) survive: nothing is migrated or dropped
    assert {"pinned_reps", "scheme"} <= _column_names(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            pinned, reps = conn.execute(
                text(
                    "SELECT pinned_reps, reps FROM exercise_prescription WHERE id = 1"
                )
            ).one()
        assert pinned == "10-14"
        assert reps == "8-12"
    finally:
        engine.dispose()


def test_a_scheme_can_be_written_after_the_upgrade(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_SCHEME)
    _seed_prescription(sqlite_url)
    command.upgrade(config, SCHEME_REVISION)

    # Act — write a scheme selection, then read it back
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription SET scheme = 'static' WHERE id = 1"
                )
            )
        with engine.connect() as conn:
            value = conn.execute(
                text("SELECT scheme FROM exercise_prescription WHERE id = 1")
            ).scalar_one()
    finally:
        engine.dispose()

    # Assert
    assert value == "static"


def test_downgrade_drops_the_column_and_keeps_reps_and_pin(sqlite_url):
    # Arrange — fully migrated with a scheme written
    config = _alembic_config()
    command.upgrade(config, BEFORE_SCHEME)
    _seed_prescription(sqlite_url)
    command.upgrade(config, SCHEME_REVISION)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE exercise_prescription SET scheme = 'static' WHERE id = 1"
                )
            )
    finally:
        engine.dispose()

    # Act — step back over the migration
    command.downgrade(config, BEFORE_SCHEME)

    # Assert — the additive column is gone; the base reps and the Pin column are untouched
    columns = _column_names(sqlite_url)
    assert "scheme" not in columns
    assert "pinned_reps" in columns
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            reps, pinned = conn.execute(
                text(
                    "SELECT reps, pinned_reps FROM exercise_prescription WHERE id = 1"
                )
            ).one()
        assert reps == "8-12"
        assert pinned == "10-14"
    finally:
        engine.dispose()
