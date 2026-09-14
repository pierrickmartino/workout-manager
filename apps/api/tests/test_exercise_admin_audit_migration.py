"""Migration test for the append-only admin audit trail (ADR-0075/0076).

Exercises 0042 end to end against a real SQLite database: upgrade over the migration and
assert the ``exercise_admin_audit`` table arrives with the append-only shape the trail
needs — actor / action / detail / created_at, keyed by a plain ``exercise_id`` — and that a
row can be inserted and read back. Downgrading drops the table, so the migration reverses
cleanly."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_AUDIT = "0041_exercise_retired"
AFTER_AUDIT = "0042_exercise_admin_audit"
TABLE = "exercise_admin_audit"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'exercise_admin_audit_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _tables(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return {
                row[0]
                for row in conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                ).all()
            }
    finally:
        engine.dispose()


def test_upgrade_creates_the_append_only_audit_table(sqlite_url):
    # Arrange — the catalog as it existed before the audit trail
    config = _alembic_config()
    command.upgrade(config, BEFORE_AUDIT)

    # Act — run the admin audit-trail migration
    command.upgrade(config, AFTER_AUDIT)

    # Assert — the table exists and accepts a provenance-change row read back verbatim
    assert TABLE in _tables(sqlite_url)
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"INSERT INTO {TABLE} "
                    "(exercise_id, actor, action, detail, created_at) "
                    "VALUES (:exercise_id, :actor, :action, :detail, :created_at)"
                ),
                {
                    "exercise_id": 7,
                    "actor": "user_admin",
                    "action": "provenance_change",
                    "detail": json.dumps({"from": "ai_generated", "to": "curated"}),
                    "created_at": "2026-09-14T00:00:00",
                },
            )
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    f"SELECT exercise_id, actor, action, detail FROM {TABLE}"
                )
            ).one()
    finally:
        engine.dispose()
    assert row.exercise_id == 7
    assert row.actor == "user_admin"
    assert row.action == "provenance_change"
    assert json.loads(row.detail) == {"from": "ai_generated", "to": "curated"}


def test_downgrade_drops_the_audit_table(sqlite_url):
    # Arrange — fully migrated with the audit table present
    config = _alembic_config()
    command.upgrade(config, AFTER_AUDIT)
    assert TABLE in _tables(sqlite_url)

    # Act — step back over the admin audit-trail migration
    command.downgrade(config, BEFORE_AUDIT)

    # Assert — the table is gone but the catalog survives
    tables = _tables(sqlite_url)
    assert TABLE not in tables
    assert "exercise" in tables
