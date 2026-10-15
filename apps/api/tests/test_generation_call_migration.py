"""Migration test for the admin AI audit log table (ADR-0135, issue #730).

Exercises 0051 end to end against a real SQLite database: upgrade over the migration and
assert the ``generation_call`` table arrives able to hold a recorded call — a system call
with unknown tokens and no output included — and that downgrading drops it again."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE = "0050_seed_tiered_exercises"
AFTER = "0051_generation_call"
TABLE = "generation_call"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'generation_call_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def test_upgrade_creates_a_table_that_holds_a_failed_system_call(sqlite_url):
    # Arrange
    config = _config()
    command.upgrade(config, BEFORE)

    # Act
    command.upgrade(config, AFTER)

    # Assert — a failed, unattributed call with unknown tokens round-trips
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"INSERT INTO {TABLE} (created_at, generator_kind, clerk_user_id, "
                    "provider, model, input_tokens, output_tokens, latency_ms, outcome, "
                    "system_prompt, user_prompt, output_text) VALUES ("
                    "'2026-10-15 12:00:00', 'exercise-enrichment', NULL, 'anthropic', "
                    "'m', NULL, NULL, 12.5, 'error', 's', 'u', NULL)"
                )
            )
        with engine.connect() as conn:
            row = conn.execute(
                text(f"SELECT generator_kind, clerk_user_id, outcome FROM {TABLE}")
            ).one()
        indexes = {ix["name"] for ix in inspect(engine).get_indexes(TABLE)}
    finally:
        engine.dispose()
    assert tuple(row) == ("exercise-enrichment", None, "error")
    assert "ix_generation_call_created_at" in indexes


def test_downgrade_drops_the_table(sqlite_url):
    config = _config()
    command.upgrade(config, AFTER)

    command.downgrade(config, BEFORE)

    engine = create_engine(sqlite_url)
    try:
        assert TABLE not in inspect(engine).get_table_names()
    finally:
        engine.dispose()
