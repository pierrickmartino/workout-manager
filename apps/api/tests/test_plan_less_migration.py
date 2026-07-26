"""Migration test for the plan-less Logged Session (issue #237, ADR-0031).

Exercises 0021 end to end against a real SQLite database: seed a plan-backed Logged
Session at the pre-plan-less revision (``session_id`` NOT NULL, no ``training_type``
column), upgrade over 0021, and assert the row now carries a ``training_type``
backfilled from its Session and that ``session_id`` has become nullable so a plan-less
record can stand alone. Downgrading one step must re-impose the NOT NULL on
``session_id`` and drop ``training_type``.

Prior art: ``test_quantity_migration`` over 0020."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_PLAN_LESS = "0020_typed_quantity"

_CREATED_AT = "2026-07-20 00:00:00"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'plan_less_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_plan_backed_log(url: str) -> None:
    """Insert a Session and a plan-backed Logged Session that points at it."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO workout_session "
                    "(id, clerk_user_id, training_type, duration_minutes, created_at, "
                    " has_been_regenerated) "
                    "VALUES (1, 'user_a', 'strength', 45, :created_at, 0)"
                ),
                {"created_at": _CREATED_AT},
            )
            conn.execute(
                text(
                    "INSERT INTO logged_session "
                    "(id, clerk_user_id, session_id, performed_on, created_at) "
                    "VALUES (1, 'user_a', 1, '2026-07-20', :created_at)"
                ),
                {"created_at": _CREATED_AT},
            )
    finally:
        engine.dispose()


def _column(url: str, table: str, name: str) -> dict:
    engine = create_engine(url)
    try:
        return next(
            col for col in inspect(engine).get_columns(table) if col["name"] == name
        )
    finally:
        engine.dispose()


def test_upgrade_backfills_training_type_and_relaxes_session_id(sqlite_url):
    # Arrange — a plan-backed Logged Session as it existed before ADR-0031
    config = _alembic_config()
    command.upgrade(config, BEFORE_PLAN_LESS)
    _seed_plan_backed_log(sqlite_url)

    # Act — run the plan-less migration
    command.upgrade(config, "0021_plan_less_logged_session")

    # Assert — training type is backfilled from the Session onto the record
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT session_id, training_type FROM logged_session WHERE id = 1")
            ).one()
    finally:
        engine.dispose()
    assert row.training_type == "strength"
    assert row.session_id == 1

    # …and the column is always-populated while session_id can now be null (plan-less)
    assert _column(sqlite_url, "logged_session", "training_type")["nullable"] is False
    assert _column(sqlite_url, "logged_session", "session_id")["nullable"] is True


def test_downgrade_reimposes_the_mandatory_session_and_drops_training_type(sqlite_url):
    # Arrange — fully migrated, training type backfilled
    config = _alembic_config()
    command.upgrade(config, BEFORE_PLAN_LESS)
    _seed_plan_backed_log(sqlite_url)
    command.upgrade(config, "0021_plan_less_logged_session")

    # Act — step back over the plan-less migration
    command.downgrade(config, BEFORE_PLAN_LESS)

    # Assert — the denormalized training type is gone and session_id is mandatory again
    columns = {c["name"]: c for c in inspect(create_engine(sqlite_url)).get_columns("logged_session")}
    assert "training_type" not in columns
    assert columns["session_id"]["nullable"] is False
