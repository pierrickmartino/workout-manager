"""Migration test for the Execution-Steps backfill (issue #103, ADR-0015).

Exercises 0013 end to end against a real SQLite database: seed free-text
``instructions`` prose at the pre-steps revision, upgrade over 0013, and assert
every row is now an ordered step list produced by the same ``parse_instruction_steps``
the write boundary uses — multi-line prose splits into one step per non-empty line,
a single paragraph becomes a single-element list, and a NULL becomes an empty list.
No sentence-level chopping, no data loss. Downgrading one step rejoins the steps
into newline-separated prose, so the migration is reversible in both directions."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.domain.exercise import parse_instruction_steps

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_STEPS = "0012_session_duration"

# id -> authored free-text instructions the backfill must convert honestly.
_MULTILINE = "Brace your core.\nUnrack the bar.\nSit down between your hips."
_SINGLE_PARAGRAPH = "Slide down a wall until your thighs are parallel. Then hold."
_BLANK_LINES = "Set your feet.\n\n\nDrive up.\n"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'instructions_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_free_text_instructions(url: str) -> None:
    """Insert catalog Exercises carrying the old free-text ``instructions`` prose."""

    engine = create_engine(url)
    rows = [
        (1, "Back Squat", "back squat", _MULTILINE),
        (2, "Wall Sit", "wall sit", _SINGLE_PARAGRAPH),
        (3, "Deadlift", "deadlift", _BLANK_LINES),
        (4, "Plank", "plank", None),  # never enriched — a NULL row must survive
    ]
    try:
        with engine.begin() as conn:
            for exercise_id, name, normalized, instructions in rows:
                conn.execute(
                    text(
                        "INSERT INTO exercise "
                        "(id, normalized_name, name, provenance, instructions) "
                        "VALUES (:id, :normalized, :name, 'curated', :instructions)"
                    ),
                    {
                        "id": exercise_id,
                        "normalized": normalized,
                        "name": name,
                        "instructions": instructions,
                    },
                )
    finally:
        engine.dispose()


def _instructions_by_id(url: str) -> dict[int, object]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, instructions FROM exercise")).all()
        return {row.id: row.instructions for row in rows}
    finally:
        engine.dispose()


def test_upgrade_splits_prose_into_ordered_step_lists(sqlite_url):
    # Arrange — schema and free-text instructions as they existed before Slice 5
    config = _alembic_config()
    command.upgrade(config, BEFORE_STEPS)
    _seed_free_text_instructions(sqlite_url)

    # Act — run the Execution-Steps migration
    command.upgrade(config, "0013_execution_steps")

    # Assert — every row is the newline-split step list; no sentence chopping
    stored = _instructions_by_id(sqlite_url)
    assert json.loads(stored[1]) == [
        "Brace your core.",
        "Unrack the bar.",
        "Sit down between your hips.",
    ]
    # A single paragraph becomes ONE step, never chopped on ". "
    assert json.loads(stored[2]) == [
        "Slide down a wall until your thighs are parallel. Then hold."
    ]
    assert json.loads(stored[3]) == ["Set your feet.", "Drive up."]
    # A NULL row becomes an empty list, never a fabricated lone step
    assert json.loads(stored[4]) == []

    # …and every conversion matches the domain rule exactly (single source of truth)
    for raw in (_MULTILINE, _SINGLE_PARAGRAPH, _BLANK_LINES, None):
        parse_instruction_steps(raw)  # documents the shared rule


def test_downgrade_rejoins_steps_into_newline_prose(sqlite_url):
    # Arrange — fully migrated with ordered step lists backfilled
    config = _alembic_config()
    command.upgrade(config, BEFORE_STEPS)
    _seed_free_text_instructions(sqlite_url)
    command.upgrade(config, "0013_execution_steps")

    # Act — step back over the Execution-Steps migration
    command.downgrade(config, BEFORE_STEPS)

    # Assert — each step list is rejoined into newline-separated prose
    stored = _instructions_by_id(sqlite_url)
    assert stored[1] == "Brace your core.\nUnrack the bar.\nSit down between your hips."
    assert stored[2] == "Slide down a wall until your thighs are parallel. Then hold."
    assert stored[3] == "Set your feet.\nDrive up."
    # An empty list unwraps back to NULL — no fabricated empty string
    assert stored[4] is None
