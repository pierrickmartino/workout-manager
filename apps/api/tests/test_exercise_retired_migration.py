"""Migration test for the Catalog Retire tombstone column (ADR-0076).

Exercises 0041 end to end against a real SQLite database: seed catalog Exercises at
the pre-retire revision, upgrade over 0041, and assert the new ``retired`` column
arrives NOT NULL and backfilled to ``false`` on every existing row — an existing
movement is active until an admin retires it, so the migration is safe on the current
catalog. Downgrading drops the column again, so the migration reverses cleanly."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_RETIRE = "0040_note"
AFTER_RETIRE = "0041_exercise_retired"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'exercise_retired_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


# Distinctive names so the seeded rows never collide with the curated movements the
# seed migration (0019) already places in the catalog before the pre-retire revision.
SEEDED_NAMES = ["Retire Fixture Squat", "Retire Fixture Plank"]


def _seed_exercises(url: str) -> None:
    """Insert catalog Exercises as they existed before the retired column."""

    engine = create_engine(url)
    rows = [
        ("Retire Fixture Squat", "retire fixture squat", ["quads", "glutes"]),
        ("Retire Fixture Plank", "retire fixture plank", ["core"]),
    ]
    try:
        with engine.begin() as conn:
            for name, normalized, targeted in rows:
                conn.execute(
                    text(
                        "INSERT INTO exercise "
                        "(normalized_name, name, provenance, targeted_muscles, "
                        "primary_muscles, secondary_muscles, required_equipment, "
                        "instructions, precautions) "
                        "VALUES (:normalized, :name, 'curated', :targeted, "
                        "'[]', '[]', '[]', '[]', '[]')"
                    ),
                    {
                        "normalized": normalized,
                        "name": name,
                        "targeted": json.dumps(targeted),
                    },
                )
    finally:
        engine.dispose()


def _columns(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return {
                row[1]
                for row in conn.execute(text("PRAGMA table_info(exercise)")).all()
            }
    finally:
        engine.dispose()


def test_upgrade_adds_retired_backfilled_false_on_existing_rows(sqlite_url):
    # Arrange — the catalog as it existed before the retired column
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_exercises(sqlite_url)

    # Act — run the Catalog Retire migration
    command.upgrade(config, AFTER_RETIRE)

    # Assert — the column exists and every existing row is active (retired = false)
    assert "retired" in _columns(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT retired FROM exercise")).all()
    finally:
        engine.dispose()
    # No existing row is retired by the migration: a movement is active until an
    # admin retires it. SQLite renders the boolean as 0.
    assert all(row.retired in (0, False) for row in rows)
    assert len(rows) > 0


def test_downgrade_drops_the_retired_column(sqlite_url):
    # Arrange — fully migrated with the retired column present
    config = _alembic_config()
    command.upgrade(config, BEFORE_RETIRE)
    _seed_exercises(sqlite_url)
    command.upgrade(config, AFTER_RETIRE)

    # Act — step back over the Catalog Retire migration
    command.downgrade(config, BEFORE_RETIRE)

    # Assert — the column is gone but the rest of the catalog survives
    assert "retired" not in _columns(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            names = {
                row.name
                for row in conn.execute(text("SELECT name FROM exercise")).all()
            }
    finally:
        engine.dispose()
    assert set(SEEDED_NAMES) <= names
