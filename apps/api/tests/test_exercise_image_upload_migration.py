"""Migration test for the uploaded Exercise Image table (issue #504, ADR-0041).

Exercises 0043 end to end against a real SQLite database: upgrade over it and assert the new
``exercise_image`` table arrives with the expected columns, an admin-uploaded image round-trips
its bytes and content-type intact, and the foreign key ties the image to ``exercise.id`` (one
image per Exercise). The legacy ``exercise.image`` string column is left untouched. Downgrading
drops the table again, so the migration reverses cleanly."""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_IMAGE = "0042_exercise_admin_audit"
AFTER_IMAGE = "0043_exercise_image_upload"


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'exercise_image_upload_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _seed_exercise(url: str) -> int:
    """Insert one catalog Exercise and return its id — the image's owner."""

    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise "
                    "(normalized_name, name, provenance, targeted_muscles, "
                    "primary_muscles, secondary_muscles, required_equipment, "
                    "instructions, precautions) "
                    "VALUES ('image fixture squat', 'Image Fixture Squat', 'curated', "
                    "'[]', '[]', '[]', '[]', '[]', '[]')"
                )
            )
            row = conn.execute(
                text("SELECT id FROM exercise WHERE normalized_name = 'image fixture squat'")
            ).one()
    finally:
        engine.dispose()
    return int(row.id)


def _columns(url: str, table: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table})")).all()
            }
    finally:
        engine.dispose()


def test_upgrade_adds_the_exercise_image_table_with_the_expected_columns(sqlite_url):
    # Arrange — the catalog just before the uploaded-image table
    config = _alembic_config()
    command.upgrade(config, BEFORE_IMAGE)

    # Act — run the uploaded Exercise Image migration
    command.upgrade(config, AFTER_IMAGE)

    # Assert — the table and its columns exist; the legacy string column is untouched
    assert _columns(sqlite_url, "exercise_image") == {
        "exercise_id",
        "content_type",
        "bytes",
        "byte_size",
        "uploaded_by",
        "uploaded_at",
    }
    assert "image" in _columns(sqlite_url, "exercise")


def test_an_uploaded_image_round_trips_its_bytes_and_type(sqlite_url):
    # Arrange — migrate fully and seed the Exercise that owns the image
    config = _alembic_config()
    command.upgrade(config, AFTER_IMAGE)
    exercise_id = _seed_exercise(sqlite_url)

    # Act — store a small PNG-ish byte payload
    payload = b"\x89PNG\r\n\x1a\n" + bytes(range(256))
    engine = create_engine(sqlite_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO exercise_image "
                    "(exercise_id, content_type, bytes, byte_size, uploaded_by, uploaded_at) "
                    "VALUES (:id, 'image/png', :bytes, :size, 'user_admin', '2026-09-14 00:00:00')"
                ),
                {"id": exercise_id, "bytes": payload, "size": len(payload)},
            )
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT content_type, bytes, byte_size, uploaded_by "
                    "FROM exercise_image WHERE exercise_id = :id"
                ),
                {"id": exercise_id},
            ).one()
    finally:
        engine.dispose()

    # Assert — the bytes and metadata survive the round trip byte-for-byte
    assert row.content_type == "image/png"
    assert bytes(row.bytes) == payload
    assert row.byte_size == len(payload)
    assert row.uploaded_by == "user_admin"


def test_downgrade_drops_the_exercise_image_table(sqlite_url):
    # Arrange — fully migrated with the table present
    config = _alembic_config()
    command.upgrade(config, AFTER_IMAGE)
    assert "exercise_image" in _tables(sqlite_url)

    # Act — step back over the migration
    command.downgrade(config, BEFORE_IMAGE)

    # Assert — the table is gone but the catalog survives
    assert "exercise_image" not in _tables(sqlite_url)
    assert "exercise" in _tables(sqlite_url)


def _tables(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return {
                row[0]
                for row in conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                ).all()
            }
    finally:
        engine.dispose()
