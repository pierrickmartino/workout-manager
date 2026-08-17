"""Migration test for the Prescribed-Quantity backfill (issue #342, ADR-0050).

Exercises 0027 end to end against a real SQLite database: seed free-text ``reps``
targets at the pre-typed revision, upgrade over 0027, and assert every
``prescribed_quantity`` row is now the typed ``quantity_from_text`` representation
(cardio strings become distance/duration, everything else defaults to repetitions)
with the original text preserved. Downgrading one step must drop the additive column
while leaving the source ``reps`` untouched — the migration is reversible and the
free-text target the backfill read from loses nothing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.domain.quantity import QuantityKind, quantity_from_text

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_TYPED = "0026_active_skin"

# One free-text target per inference outcome: a cardio distance, a duration in two
# spellings, a plain strength count, a rep range, and an AMRAP — the zoo the backfill
# must type. Keyed by the id we seed so the assertion can look each row up.
_PRESCRIPTION_REPS: dict[int, str] = {
    1: "7 KM",
    2: "30 min",
    3: "0:30",
    4: "5",
    5: "8-12",
    6: "AMRAP",
}


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'prescribed_quantity_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_free_text_reps(url: str) -> None:
    """Insert prescriptions carrying the old free-text targets (no typed quantity yet)."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            for prescription_id, reps in _PRESCRIPTION_REPS.items():
                conn.execute(
                    text(
                        "INSERT INTO exercise_prescription "
                        "(id, session_id, exercise_id, position, sets, reps) "
                        "VALUES (:id, 1, 1, :position, 3, :reps)"
                    ),
                    {"id": prescription_id, "position": prescription_id, "reps": reps},
                )
    finally:
        engine.dispose()


def _column_values(url: str, column: str) -> dict[int, object]:
    """Read one column of every prescription keyed by id (``column`` is a fixed literal)."""

    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(f"SELECT id, {column} AS value FROM exercise_prescription")
            ).all()
        return {row.id: row.value for row in rows}
    finally:
        engine.dispose()


def test_upgrade_types_and_backfills_free_text_reps(sqlite_url):
    # Arrange — schema and free-text targets as they existed before the typed plan side
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_free_text_reps(sqlite_url)

    # Act — run the Prescribed-Quantity migration
    command.upgrade(config, "0027_prescribed_quantity")

    # Assert — every row's prescribed_quantity is the typed quantity_from_text JSON,
    # matching the shared inference primitive with the original text preserved.
    quantities = _column_values(sqlite_url, "prescribed_quantity")
    for prescription_id, raw in _PRESCRIPTION_REPS.items():
        stored = json.loads(quantities[prescription_id])
        assert stored == quantity_from_text(raw).to_dict()
        assert stored["text"] == raw  # no data loss: the original prose is kept


def test_upgrade_infers_the_right_kind_per_target(sqlite_url):
    # Arrange — the seeded zoo covers distance, duration, and the repetitions default
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_free_text_reps(sqlite_url)

    # Act
    command.upgrade(config, "0027_prescribed_quantity")

    # Assert — cardio prose types to distance/duration; a count, a range, and AMRAP all
    # default to repetitions so existing strength prescriptions are unaffected.
    quantities = _column_values(sqlite_url, "prescribed_quantity")
    kinds = {pid: json.loads(value)["kind"] for pid, value in quantities.items()}
    assert kinds[1] == QuantityKind.DISTANCE.value  # "7 KM"
    assert kinds[2] == QuantityKind.DURATION.value  # "30 min"
    assert kinds[3] == QuantityKind.DURATION.value  # "0:30"
    assert kinds[4] == QuantityKind.REPETITIONS.value  # "5"
    assert kinds[5] == QuantityKind.REPETITIONS.value  # "8-12"
    assert kinds[6] == QuantityKind.REPETITIONS.value  # "AMRAP"
    # The canonical distance is in metres and the plain count is carried through.
    assert json.loads(quantities[1])["metres"] == 7000.0
    assert json.loads(quantities[4])["count"] == 5


def test_downgrade_drops_the_column_and_keeps_reps(sqlite_url):
    # Arrange — fully migrated with typed quantities backfilled
    config = _alembic_config()
    command.upgrade(config, BEFORE_TYPED)
    _seed_free_text_reps(sqlite_url)
    command.upgrade(config, "0027_prescribed_quantity")

    # Act — step back over the migration
    command.downgrade(config, BEFORE_TYPED)

    # Assert — the additive column is gone and the source free-text reps is untouched
    reps = _column_values(sqlite_url, "reps")
    for prescription_id, raw in _PRESCRIPTION_REPS.items():
        assert reps[prescription_id] == raw

    engine = create_engine(sqlite_url)
    try:
        with engine.connect() as conn:
            columns = {
                row[1]
                for row in conn.execute(
                    text("PRAGMA table_info(exercise_prescription)")
                ).all()
            }
    finally:
        engine.dispose()
    assert "prescribed_quantity" not in columns
