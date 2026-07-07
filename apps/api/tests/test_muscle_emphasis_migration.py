"""Migration test for the Primary/Secondary muscle emphasis split (issue #104, ADR-0016).

Exercises 0014 end to end against a real SQLite database: seed catalog Exercises
carrying only the flat ``targeted_muscles`` union at the pre-split revision, upgrade
over 0014, and assert the two new emphasis columns arrive with empty defaults while
every existing row's ``targeted_muscles`` survives untouched — the split is an
annotation layered on top of the union, never a repurposing of it. Downgrading drops
the split columns and leaves the union intact, so the migration reverses cleanly."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SPLIT = "0013_execution_steps"
AFTER_SPLIT = "0014_muscle_emphasis_split"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'muscle_emphasis_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_flat_muscle_exercises(url: str) -> None:
    """Insert catalog Exercises carrying only the flat ``targeted_muscles`` union."""

    engine = create_engine(url)
    rows = [
        (1, "Back Squat", "back squat", ["quads", "glutes"]),
        (2, "Plank", "plank", ["core"]),
        (3, "Nameless Move", "nameless move", []),
    ]
    try:
        with engine.begin() as conn:
            for exercise_id, name, normalized, targeted in rows:
                conn.execute(
                    text(
                        "INSERT INTO exercise "
                        "(id, normalized_name, name, provenance, targeted_muscles, "
                        "instructions) "
                        "VALUES (:id, :normalized, :name, 'curated', :targeted, '[]')"
                    ),
                    {
                        "id": exercise_id,
                        "normalized": normalized,
                        "name": name,
                        "targeted": json.dumps(targeted),
                    },
                )
    finally:
        engine.dispose()


def _muscles_by_id(url: str) -> dict[int, dict[str, object]]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, targeted_muscles, primary_muscles, secondary_muscles "
                    "FROM exercise"
                )
            ).all()
        return {
            row.id: {
                "targeted": row.targeted_muscles,
                "primary": row.primary_muscles,
                "secondary": row.secondary_muscles,
            }
            for row in rows
        }
    finally:
        engine.dispose()


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else json.loads(value)


def test_upgrade_adds_empty_split_and_keeps_the_union_intact(sqlite_url):
    # Arrange — schema and flat targeted muscles as they existed before the split
    config = _alembic_config()
    command.upgrade(config, BEFORE_SPLIT)
    _seed_flat_muscle_exercises(sqlite_url)

    # Act — run the muscle-emphasis migration
    command.upgrade(config, AFTER_SPLIT)

    # Assert — the two new columns default empty; every union is untouched
    stored = _muscles_by_id(sqlite_url)
    assert _as_list(stored[1]["targeted"]) == ["quads", "glutes"]
    assert _as_list(stored[2]["targeted"]) == ["core"]
    assert _as_list(stored[3]["targeted"]) == []
    for row in stored.values():
        # No fabricated primacy (ADR-0016): the split arrives empty for every row.
        assert _as_list(row["primary"]) == []
        assert _as_list(row["secondary"]) == []


def test_downgrade_drops_the_split_and_leaves_the_union(sqlite_url):
    # Arrange — fully migrated with the empty split columns present
    config = _alembic_config()
    command.upgrade(config, BEFORE_SPLIT)
    _seed_flat_muscle_exercises(sqlite_url)
    command.upgrade(config, AFTER_SPLIT)

    # Act — step back over the muscle-emphasis migration
    command.downgrade(config, BEFORE_SPLIT)

    # Assert — the split columns are gone but the union survives
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            columns = {
                row[1]
                for row in conn.execute(text("PRAGMA table_info(exercise)")).all()
            }
            rows = conn.execute(
                text("SELECT id, targeted_muscles FROM exercise ORDER BY id")
            ).all()
    finally:
        engine.dispose()

    assert "primary_muscles" not in columns
    assert "secondary_muscles" not in columns
    assert _as_list(rows[0].targeted_muscles) == ["quads", "glutes"]
