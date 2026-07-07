"""Execution instructions become an ordered step list (ADR-0015)

Makes a catalog Exercise's ``instructions`` first-class ordered Execution Steps:
``exercise.instructions`` becomes a JSON column holding a ``list[str]`` instead of a
free-text blob. Existing prose is backfilled by running the same
``parse_instruction_steps`` the write boundary now uses — one step per non-empty
line, a single paragraph into a single-element list, a NULL into an empty list —
with **no** sentence-level chopping, so the number of steps equals what the author
wrote and no data is lost.

The downgrade rejoins each step list into newline-separated prose (an empty list
unwraps back to NULL), so the migration is reversible in both directions.

Revision ID: 0013_execution_steps
Revises: 0012_session_duration
Create Date: 2026-07-07
"""
from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

from app.domain.exercise import parse_instruction_steps

revision: str = "0013_execution_steps"
down_revision: str | None = "0012_session_duration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_to_steps() -> None:
    """Rewrite every ``instructions`` blob as its ordered ``parse_instruction_steps``
    JSON — including NULL rows, which become an empty list so the column is non-null."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, instructions AS value FROM exercise")
    ).fetchall()
    for row in rows:
        steps = json.dumps(parse_instruction_steps(row.value))
        bind.execute(
            sa.text("UPDATE exercise SET instructions = :value WHERE id = :id"),
            {"value": steps, "id": row.id},
        )


def _backfill_to_prose() -> None:
    """Rejoin every step list into newline-separated prose; an empty list → NULL."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, instructions AS value FROM exercise")
    ).fetchall()
    for row in rows:
        steps = row.value if isinstance(row.value, list) else json.loads(row.value)
        prose = "\n".join(steps) if steps else None
        bind.execute(
            sa.text("UPDATE exercise SET instructions = :value WHERE id = :id"),
            {"value": prose, "id": row.id},
        )


def upgrade() -> None:
    # Backfill while the column is still text, then widen it to a non-null JSON list.
    _backfill_to_steps()
    with op.batch_alter_table("exercise") as batch:
        batch.alter_column(
            "instructions",
            existing_type=sqlmodel.sql.sqltypes.AutoString(),
            type_=sa.JSON(),
            existing_nullable=True,
            nullable=False,
            server_default=sa.text("'[]'"),
            postgresql_using="instructions::json",
        )


def downgrade() -> None:
    with op.batch_alter_table("exercise") as batch:
        batch.alter_column(
            "instructions",
            existing_type=sa.JSON(),
            type_=sqlmodel.sql.sqltypes.AutoString(),
            existing_nullable=False,
            nullable=True,
            server_default=None,
        )
    _backfill_to_prose()
