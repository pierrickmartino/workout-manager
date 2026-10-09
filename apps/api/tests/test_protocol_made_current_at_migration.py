"""Migration test for the Protocol ``made_current_at`` column (#635, ADR-0125).

Exercises 0045 end to end against a real SQLite database: seed several users' Protocols at the
prior revision, upgrade over 0045, and assert every row gains a non-null ``made_current_at``
backfilled from its ``created_at``. Because the Current Protocol used to be the unfinished
Protocol with the latest ``created_at`` and is now the one with the latest ``made_current_at``,
the backfill is what keeps every user's Current Protocol unchanged across the release.
Downgrading one step drops the column again, so the migration is reversible.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
BEFORE_MADE_CURRENT = "0044_protocol_calibration"
MADE_CURRENT = "0045_protocol_made_current_at"

# (id, user, created_at, every Session performed?) — user_a's newest Protocol is finished, so
# its Current Protocol is the older unfinished one; user_b's two rows share a ``created_at``,
# so the id tie-break decides; user_c has only a finished Protocol, so no Current Protocol.
PROTOCOLS = [
    (1, "user_a", "2026-01-01 08:00:00", False),
    (2, "user_a", "2026-02-01 08:00:00", False),
    (3, "user_a", "2026-03-01 08:00:00", True),
    (4, "user_b", "2026-01-15 08:00:00", False),
    (5, "user_b", "2026-01-15 08:00:00", False),
    (6, "user_c", "2026-01-20 08:00:00", True),
]


@pytest.fixture()
def sqlite_url(tmp_path, monkeypatch):
    """A throwaway SQLite database wired into the app settings for Alembic."""

    url = f"sqlite:///{tmp_path / 'protocol_made_current_at_migration.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    try:
        yield url
    finally:
        get_settings.cache_clear()


def _alembic_config() -> Config:
    return Config(str(API_ROOT / "alembic.ini"))


def _execute(url: str, sql: str, params: dict | None = None) -> None:
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(text(sql), params or {})
    finally:
        engine.dispose()


def _seed(url: str) -> None:
    """Insert each Protocol with one member Session, logged when the Protocol is finished."""

    for protocol_id, user, created_at, finished in PROTOCOLS:
        _execute(
            url,
            "INSERT INTO protocol "
            "(id, clerk_user_id, training_type, objective, "
            "sessions_per_week, weeks, duration_minutes, created_at) "
            "VALUES (:id, :user, 'strength', 'gain muscle mass', 1, 1, 45, :created_at)",
            {"id": protocol_id, "user": user, "created_at": created_at},
        )
        _execute(
            url,
            "INSERT INTO workout_session "
            "(id, clerk_user_id, training_type, duration_minutes, protocol_id, "
            "objective, week, day, position, created_at) "
            "VALUES (:id, :user, 'strength', 45, :id, 'gain muscle mass', 1, 1, 0, "
            ":created_at)",
            {"id": protocol_id, "user": user, "created_at": created_at},
        )
        if finished:
            _execute(
                url,
                "INSERT INTO logged_session "
                "(id, clerk_user_id, session_id, training_type, performed_on, created_at) "
                "VALUES (:id, :user, :id, 'strength', '2026-03-02', :created_at)",
                {"id": protocol_id, "user": user, "created_at": created_at},
            )


def _rows(url: str) -> list:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(
                text(
                    "SELECT p.id, p.clerk_user_id, p.created_at, p.made_current_at, "
                    "EXISTS (SELECT 1 FROM workout_session s WHERE s.protocol_id = p.id "
                    "AND NOT EXISTS (SELECT 1 FROM logged_session l "
                    "WHERE l.session_id = s.id)) AS unfinished "
                    "FROM protocol p"
                )
            ).all()
    finally:
        engine.dispose()


def _current_by_user(rows: list, column: str) -> dict[str, int | None]:
    """Each user's Current Protocol id: the unfinished row with the latest ``column``,
    ties broken by id."""

    users = {row.clerk_user_id for row in rows}
    current: dict[str, int | None] = {}
    for user in users:
        unfinished = [r for r in rows if r.clerk_user_id == user and r.unfinished]
        best = max(unfinished, key=lambda r: (getattr(r, column), r.id), default=None)
        current[user] = best.id if best is not None else None
    return current


def _has_made_current_column(url: str) -> bool:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(protocol)")).all()
        return any(column.name == "made_current_at" for column in columns)
    finally:
        engine.dispose()


def test_upgrade_backfills_made_current_at_from_created_at(sqlite_url):
    # Arrange — Protocols from before the column existed
    config = _alembic_config()
    command.upgrade(config, BEFORE_MADE_CURRENT)
    _seed(sqlite_url)

    # Act
    command.upgrade(config, MADE_CURRENT)

    # Assert — every row carries its own created_at as its made_current_at
    rows = _rows(sqlite_url)
    assert len(rows) == len(PROTOCOLS)
    assert all(row.made_current_at == row.created_at for row in rows)


def test_every_users_current_protocol_is_unchanged_by_the_backfill(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_MADE_CURRENT)
    _seed(sqlite_url)

    # Act
    command.upgrade(config, MADE_CURRENT)

    # Assert — selecting by made_current_at picks what selecting by created_at picked:
    # user_a falls back past the finished newest, user_b's tie goes to the higher id,
    # and user_c has none.
    rows = _rows(sqlite_url)
    assert _current_by_user(rows, "made_current_at") == {
        "user_a": 2,
        "user_b": 5,
        "user_c": None,
    }
    assert _current_by_user(rows, "made_current_at") == _current_by_user(
        rows, "created_at"
    )


def test_made_current_at_is_non_null_after_the_upgrade(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_MADE_CURRENT)
    _seed(sqlite_url)
    command.upgrade(config, MADE_CURRENT)

    # Act / Assert — clearing the choice is refused by the schema
    with pytest.raises(IntegrityError):
        _execute(sqlite_url, "UPDATE protocol SET made_current_at = NULL WHERE id = 1")


def test_downgrade_drops_the_made_current_at_column(sqlite_url):
    # Arrange
    config = _alembic_config()
    command.upgrade(config, BEFORE_MADE_CURRENT)
    _seed(sqlite_url)
    command.upgrade(config, MADE_CURRENT)

    # Act
    command.downgrade(config, BEFORE_MADE_CURRENT)

    # Assert
    assert not _has_made_current_column(sqlite_url)
