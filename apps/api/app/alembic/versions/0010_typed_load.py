"""type Load as a value object and backfill free-text rows (ADR-0010)

Makes Load a typed value object at rest: ``exercise_prescription.recommended_load``
and ``logged_set.load`` become JSON columns holding a ``{kind, text, ...payload}``
representation instead of free text. Existing free-text rows are backfilled by
running the same ``parse_load`` the write boundary now uses, so a ``"70kg"`` row
becomes ``{"kind": "absolute", "text": "70kg", "kg": 70.0}`` — the meaning is fixed
once, with no data loss (the original text is preserved verbatim in ``text``).

The downgrade is lossless in the other direction: it unwraps each typed Load back
to its stored ``text``.

Revision ID: 0010_typed_load
Revises: 0009_rename_program_to_protocol
Create Date: 2026-07-05
"""
from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

from app.domain.load import ParsedLoad, parse_load

revision: str = "0010_typed_load"
down_revision: str | None = "0009_rename_program_to_protocol"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The two columns that carry a Load, keyed by their owning table.
_LOAD_COLUMNS = (
    ("exercise_prescription", "recommended_load"),
    ("logged_set", "load"),
)


def _backfill_to_typed(table: str, column: str) -> None:
    """Rewrite every non-null free-text load as its typed ``parse_load`` JSON."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, {column} AS value FROM {table} WHERE {column} IS NOT NULL")
    ).fetchall()
    for row in rows:
        typed = json.dumps(parse_load(row.value).to_dict())
        bind.execute(
            sa.text(f"UPDATE {table} SET {column} = :value WHERE id = :id"),
            {"value": typed, "id": row.id},
        )


def _backfill_to_text(table: str, column: str) -> None:
    """Unwrap every typed load back to its preserved ``text`` (lossless downgrade)."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, {column} AS value FROM {table} WHERE {column} IS NOT NULL")
    ).fetchall()
    for row in rows:
        stored = row.value if isinstance(row.value, dict) else json.loads(row.value)
        text = ParsedLoad.from_dict(stored).text
        bind.execute(
            sa.text(f"UPDATE {table} SET {column} = :value WHERE id = :id"),
            {"value": text, "id": row.id},
        )


def upgrade() -> None:
    for table, column in _LOAD_COLUMNS:
        # Backfill while the column is still text, then widen its type to JSON.
        _backfill_to_typed(table, column)
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column,
                existing_type=sqlmodel.sql.sqltypes.AutoString(),
                type_=sa.JSON(),
                existing_nullable=True,
                postgresql_using=f"{column}::json",
            )


def downgrade() -> None:
    for table, column in _LOAD_COLUMNS:
        _backfill_to_text(table, column)
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column,
                existing_type=sa.JSON(),
                type_=sqlmodel.sql.sqltypes.AutoString(),
                existing_nullable=True,
            )
