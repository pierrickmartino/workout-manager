"""Migration test for the common-movement seed (ADR-0033).

Exercises 0019 end to end against a real SQLite database: upgrade over it and assert
every seed movement lands as a ``curated`` catalog entry with its guidance step;
re-running the whole upgrade path never duplicates them (idempotent); a user who
created a bare ``user_entered`` entry first keeps it untouched; and the downgrade
removes only the still-curated seed rows."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.db.seed_movements import COMMON_MOVEMENTS
from app.domain.exercise import normalize_name

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_SEED = "0018_performed_body_weight"
AT_SEED = "0019_seed_common_movements"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'seed_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _rows(url: str) -> list:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(
                text(
                    "SELECT normalized_name, name, provenance, targeted_muscles, "
                    "instructions FROM exercise"
                )
            ).all()
    finally:
        engine.dispose()


def test_upgrade_seeds_every_movement_as_curated_with_guidance(sqlite_url):
    # Arrange
    config = _alembic_config()

    # Act — run the full path up to and including the seed migration
    command.upgrade(config, AT_SEED)

    # Assert — one curated row per seed movement, carrying its single guidance step
    by_key = {row.normalized_name: row for row in _rows(sqlite_url)}
    for movement in COMMON_MOVEMENTS:
        row = by_key[normalize_name(movement.name)]
        assert row.provenance == "curated"
        assert json.loads(row.instructions) == [movement.guidance]
        assert json.loads(row.targeted_muscles) == list(movement.targeted_muscles)


def test_rerunning_the_seed_is_idempotent(sqlite_url):
    # Arrange — already fully migrated (seed applied once)
    config = _alembic_config()
    command.upgrade(config, AT_SEED)

    # Act — step back over the seed and re-apply it, as a redeploy would
    command.downgrade(config, BEFORE_SEED)
    command.upgrade(config, AT_SEED)

    # Assert — still exactly one row per movement, no duplicates
    keys = [row.normalized_name for row in _rows(sqlite_url)]
    assert sorted(keys) == sorted(normalize_name(m.name) for m in COMMON_MOVEMENTS)


def test_seed_skips_and_preserves_a_pre_existing_user_entry(sqlite_url):
    # Arrange — migrate to just before the seed, then a user creates a bare "Running"
    config = _alembic_config()
    command.upgrade(config, BEFORE_SEED)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise (normalized_name, name, provenance, "
                    "targeted_muscles, primary_muscles, secondary_muscles, "
                    "required_equipment, instructions, precautions) "
                    "VALUES ('running', 'Running', 'user_entered', "
                    "'[]', '[]', '[]', '[]', '[]', '[]')"
                )
            )
    finally:
        engine.dispose()

    # Act — the seed runs
    command.upgrade(config, AT_SEED)

    # Assert — the user's row is preserved (not clobbered to curated), and not duplicated
    running = [r for r in _rows(sqlite_url) if r.normalized_name == "running"]
    assert len(running) == 1
    assert running[0].provenance == "user_entered"


def test_downgrade_removes_only_the_seed_rows(sqlite_url):
    # Arrange — fully seeded
    config = _alembic_config()
    command.upgrade(config, AT_SEED)

    # Act — step back over the seed
    command.downgrade(config, BEFORE_SEED)

    # Assert — the curated seed rows are gone
    assert _rows(sqlite_url) == []
