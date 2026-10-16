"""Migration tests for the admin AI audit log table (ADR-0135, issues #730 and #731).

Exercises 0051 and 0052 end to end against a real SQLite database: upgrade over the
migration and assert the ``generation_call`` table arrives able to hold a recorded call — a
system call with unknown tokens and no output included — and that 0052 adds the detail
columns (error message, schema name, token budget) as nullable, so rows recorded before it
survive; downgrading reverses each."""

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
DETAIL = "0052_generation_call_detail"
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


def test_detail_upgrade_keeps_an_earlier_row_and_adds_nullable_detail_columns(sqlite_url):
    # Arrange — a row recorded before the detail columns existed
    config = _config()
    command.upgrade(config, AFTER)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"INSERT INTO {TABLE} (created_at, generator_kind, provider, model, "
                    "latency_ms, outcome, system_prompt, user_prompt) VALUES ("
                    "'2026-10-15 12:00:00', 'session', 'anthropic', 'm', 1.0, 'error', "
                    "'s', 'u')"
                )
            )

        # Act
        command.upgrade(config, DETAIL)

        # Assert — the old row reads back with the detail columns empty
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    f"SELECT outcome, error_message, schema_name, max_tokens FROM {TABLE}"
                )
            ).one()
    finally:
        engine.dispose()
    assert tuple(row) == ("error", None, None, None)


def test_detail_downgrade_drops_the_detail_columns(sqlite_url):
    config = _config()
    command.upgrade(config, DETAIL)

    command.downgrade(config, AFTER)

    engine = create_engine(sqlite_url)
    try:
        columns = {column["name"] for column in inspect(engine).get_columns(TABLE)}
    finally:
        engine.dispose()
    assert not {"error_message", "schema_name", "max_tokens"} & columns
