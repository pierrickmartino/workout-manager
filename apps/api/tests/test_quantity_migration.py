"""Migration test for the Typed-Quantity backfill (issue #236, ADR-0032).

Exercises 0020 end to end against a real SQLite database: seed integer-``reps`` Logged
Sets at the pre-Quantity revision, upgrade over 0020, and assert every ``logged_set``
row now carries a ``repetitions`` Quantity backfilled from its old ``reps`` — with the
count preserved and the original ``reps`` column retired (no data loss). Downgrading one
step must re-add the ``reps`` column and unwrap each Quantity's count back into it, so
the migration is reversible in both directions.

Prior art: ``test_load_migration`` over 0010."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.config import get_settings
from app.domain.quantity import Quantity, QuantityKind

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_TYPED = "0019_seed_common_movements"

# One Logged Set per rep count the backfill must preserve, keyed by id.
_LOGGED_REPS = {1: 5, 2: 1, 3: 12}


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'quantity_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_integer_reps(url: str) -> None:
    """Insert Logged Sets carrying the old integer ``reps`` (load already typed JSON)."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            for position, (row_id, reps) in enumerate(_LOGGED_REPS.items()):
                conn.execute(
                    text(
                        "INSERT INTO logged_set "
                        "(id, logged_session_id, exercise_id, position, reps, load) "
                        "VALUES (:id, 1, 1, :position, :reps, NULL)"
                    ),
                    {"id": row_id, "position": position, "reps": reps},
                )
    finally:
        engine.dispose()


def _column_names(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        return {col["name"] for col in inspect(engine).get_columns(table)}
    finally:
        engine.dispose()


def _quantity_values(url: str) -> dict[int, object]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT id, quantity AS value FROM logged_set")
            ).all()
        return {row.id: row.value for row in rows}
    finally:
        engine.dispose()


def test_upgrade_types_and_backfills_integer_reps(sqlite_url):
    # Arrange — schema and integer-reps rows as they existed before typed Quantity
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_integer_reps(sqlite_url)

    # Act — run the typed-Quantity migration
    command.upgrade(config, "0020_typed_quantity")

    # Assert — every set now carries the repetitions Quantity backfilled from its reps
    quantities = _quantity_values(sqlite_url)
    for row_id, reps in _LOGGED_REPS.items():
        stored = json.loads(quantities[row_id])
        expected = Quantity(
            kind=QuantityKind.REPETITIONS, text=str(reps), count=reps
        ).to_dict()
        assert stored == expected  # count preserved, no data loss
        assert stored["count"] == reps

    # …and the old integer reps column is retired
    columns = _column_names(sqlite_url, "logged_set")
    assert "quantity" in columns
    assert "reps" not in columns


def test_downgrade_unwraps_quantities_back_to_integer_reps(sqlite_url):
    # Arrange — fully migrated with typed Quantities backfilled
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_integer_reps(sqlite_url)
    command.upgrade(config, "0020_typed_quantity")

    # Act — step back over the typed-Quantity migration
    command.downgrade(config, BEFORE_TYPED)

    # Assert — the reps column is restored, each count unwrapped back into it
    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT id, reps FROM logged_set")).all()
        restored = {row.id: row.reps for row in rows}
    finally:
        engine.dispose()

    assert restored == _LOGGED_REPS
    columns = _column_names(sqlite_url, "logged_set")
    assert "reps" in columns
    assert "quantity" not in columns
