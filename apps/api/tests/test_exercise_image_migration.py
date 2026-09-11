"""Migration test for the optional Exercise Image column (issue #306, ADR-0041).

Exercises 0024 end to end against a real SQLite database: seed catalog Exercises at
the pre-image revision, upgrade over 0024, and assert the new nullable ``image``
column arrives with no value on any existing row — a movement with no picture is
still fully usable, so the migration is safe on the existing catalog. Downgrading
drops the column again, so the migration reverses cleanly."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_IMAGE = "0023_session_provenance"
AFTER_IMAGE = "0024_exercise_image"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'exercise_image_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


# Distinctive names so the seeded rows never collide with the curated movements
# migration 0019 inserts before the pre-image revision.
SEEDED_NAMES = ["Migration Fixture Squat", "Migration Fixture Plank"]


def _seed_exercises(url: str) -> None:
    """Insert catalog Exercises as they existed before the image column.

    Ids are left to autoincrement so these rows never collide with the movements
    the seed migration (0019) already placed in the catalog at this revision."""

    engine = create_engine(url)
    rows = [
        ("Migration Fixture Squat", "migration fixture squat", ["quads", "glutes"]),
        ("Migration Fixture Plank", "migration fixture plank", ["core"]),
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


def test_upgrade_adds_a_nullable_image_that_is_unset_on_existing_rows(sqlite_url):
    # Arrange — the catalog as it existed before the image column
    config = _alembic_config()
    command.upgrade(config, BEFORE_IMAGE)
    _seed_exercises(sqlite_url)

    # Act — run the Exercise Image migration
    command.upgrade(config, AFTER_IMAGE)

    # Assert — the column exists and every existing row carries no image
    assert "image" in _columns(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT image FROM exercise")
            ).all()
    finally:
        engine.dispose()
    # No existing row — seed fixtures or the catalog's own seeded movements —
    # gains an image; the safe migration leaves every one unset.
    assert all(row.image is None for row in rows)
    assert len(rows) > 0


def test_downgrade_drops_the_image_column(sqlite_url):
    # Arrange — fully migrated with the image column present
    config = _alembic_config()
    command.upgrade(config, BEFORE_IMAGE)
    _seed_exercises(sqlite_url)
    command.upgrade(config, AFTER_IMAGE)

    # Act — step back over the Exercise Image migration
    command.downgrade(config, BEFORE_IMAGE)

    # Assert — the column is gone but the rest of the catalog survives
    columns = _columns(sqlite_url)
    assert "image" not in columns
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
