"""Migration test for the curated Catalog Exercises Curated Protocols name (ADR-0130).

Runs 0046 end to end against a real SQLite database: every manifest entry lands as a
``curated`` Exercise with its details, a re-run never duplicates one, an entry someone created
first is kept untouched, and the downgrade removes only the still-curated seed rows."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.curated.exercises import CURATED_EXERCISES
from app.domain.exercise import normalize_name

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SEED = "0045_protocol_made_current_at"
AT_SEED = "0046_seed_curated_exercises"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'curated_seed.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _curated_rows(url: str) -> dict:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT normalized_name, name, description, provenance, "
                    "targeted_muscles, required_equipment, instructions FROM exercise"
                )
            ).all()
    finally:
        engine.dispose()
    manifest = {normalize_name(item.name) for item in CURATED_EXERCISES}
    return {row.normalized_name: row for row in rows if row.normalized_name in manifest}


def test_upgrade_seeds_every_manifest_entry_as_a_curated_exercise(sqlite_url):
    # Act
    command.upgrade(_config(), AT_SEED)

    # Assert
    rows = _curated_rows(sqlite_url)
    for item in CURATED_EXERCISES:
        row = rows[normalize_name(item.name)]
        assert row.name == item.name
        assert row.provenance == "curated"
        assert row.description == item.description
        assert json.loads(row.targeted_muscles) == list(item.targeted_muscles)
        assert json.loads(row.required_equipment) == list(item.required_equipment)
        assert json.loads(row.instructions) == [item.guidance]


def test_rerunning_the_seed_is_idempotent(sqlite_url):
    # Arrange
    config = _config()
    command.upgrade(config, AT_SEED)

    # Act
    command.downgrade(config, BEFORE_SEED)
    command.upgrade(config, AT_SEED)

    # Assert
    assert len(_curated_rows(sqlite_url)) == len(CURATED_EXERCISES)


def test_an_existing_entry_is_kept_untouched(sqlite_url):
    # Arrange — generation minted the squat before the seed ran
    config = _config()
    command.upgrade(config, BEFORE_SEED)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise (normalized_name, name, provenance, "
                    "targeted_muscles, primary_muscles, secondary_muscles, "
                    "required_equipment, instructions, precautions) "
                    "VALUES (:key, 'Barbell back squat', 'ai_generated', "
                    "'[]', '[]', '[]', '[]', '[]', '[]')"
                ),
                {"key": normalize_name("Barbell Back Squat")},
            )
    finally:
        engine.dispose()

    # Act
    command.upgrade(config, AT_SEED)
    command.downgrade(config, BEFORE_SEED)

    # Assert — neither the seed nor its rollback touched it
    squat = _curated_rows(sqlite_url)[normalize_name("Barbell Back Squat")]
    assert squat.provenance == "ai_generated"
    assert squat.name == "Barbell back squat"


def test_downgrade_removes_the_seeded_rows(sqlite_url):
    # Arrange
    config = _config()
    command.upgrade(config, AT_SEED)

    # Act
    command.downgrade(config, BEFORE_SEED)

    # Assert
    assert _curated_rows(sqlite_url) == {}
