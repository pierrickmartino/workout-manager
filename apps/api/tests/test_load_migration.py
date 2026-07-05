"""Migration test for the Typed-Load backfill (issue #72, ADR-0010).

Exercises 0010 end to end against a real SQLite database: seed free-text loads at
the pre-typed revision, upgrade over 0010, and assert every ``recommended_load`` /
``load`` row is now the typed ``parse_load`` representation with its original text
preserved (no data loss). Downgrading one step must unwrap each typed Load back to
its free text, so the migration is reversible in both directions."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.domain.load import parse_load

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_TYPED = "0009_rename_program_to_protocol"

# One free-text load per known kind — the zoo the backfill must preserve.
_PRESCRIPTION_LOADS = ["70kg", "70% 1RM", "70-80 kg", "bodyweight", "moderate"]
_LOGGED_LOADS = ["60", "bodyweight + 10kg"]


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'load_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_free_text_loads(url: str) -> None:
    """Insert prescriptions and logged sets carrying the old free-text loads."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            for position, load in enumerate(_PRESCRIPTION_LOADS):
                conn.execute(
                    text(
                        "INSERT INTO exercise_prescription "
                        "(id, session_id, exercise_id, position, sets, reps, recommended_load) "
                        "VALUES (:id, 1, 1, :position, 3, '5', :load)"
                    ),
                    {"id": position + 1, "position": position, "load": load},
                )
            for position, load in enumerate(_LOGGED_LOADS):
                conn.execute(
                    text(
                        "INSERT INTO logged_set "
                        "(id, logged_session_id, exercise_id, position, reps, load) "
                        "VALUES (:id, 1, 1, :position, 5, :load)"
                    ),
                    {"id": position + 1, "position": position, "load": load},
                )
            # A null load must survive untouched — no spurious typed value.
            conn.execute(
                text(
                    "INSERT INTO exercise_prescription "
                    "(id, session_id, exercise_id, position, sets, reps, recommended_load) "
                    "VALUES (99, 1, 1, 99, 3, '5', NULL)"
                )
            )
    finally:
        engine.dispose()


def _load_values(url: str, table: str, column: str) -> dict[int, object]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(f"SELECT id, {column} AS value FROM {table}")).all()
        return {row.id: row.value for row in rows}
    finally:
        engine.dispose()


def test_upgrade_types_and_backfills_free_text_loads(sqlite_url):
    # Arrange — schema and free-text data as they existed before typed Load
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_free_text_loads(sqlite_url)

    # Act — run the typed-Load migration
    command.upgrade(config, "0010_typed_load")

    # Assert — every prescription load is the typed parse_load JSON, text preserved
    prescriptions = _load_values(sqlite_url, "exercise_prescription", "recommended_load")
    for position, raw in enumerate(_PRESCRIPTION_LOADS):
        stored = json.loads(prescriptions[position + 1])
        assert stored == parse_load(raw).to_dict()
        assert stored["text"] == raw  # no data loss: the original text is kept

    logged = _load_values(sqlite_url, "logged_set", "load")
    for position, raw in enumerate(_LOGGED_LOADS):
        assert json.loads(logged[position + 1]) == parse_load(raw).to_dict()

    # …and a null load stays null, never a fabricated typed value
    assert prescriptions[99] is None


def test_downgrade_unwraps_typed_loads_back_to_free_text(sqlite_url):
    # Arrange — fully migrated with typed loads backfilled
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_free_text_loads(sqlite_url)
    command.upgrade(config, "0010_typed_load")

    # Act — step back over the typed-Load migration
    command.downgrade(config, BEFORE_TYPED)

    # Assert — each load is unwrapped to its preserved free text
    prescriptions = _load_values(sqlite_url, "exercise_prescription", "recommended_load")
    for position, raw in enumerate(_PRESCRIPTION_LOADS):
        assert prescriptions[position + 1] == raw
    assert prescriptions[99] is None
