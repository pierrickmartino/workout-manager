"""type the Logged Set amount axis as a Quantity and backfill integer reps (ADR-0032)

Makes the Logged Set's amount a typed value object at rest: ``logged_set`` gains a
``quantity`` JSON column holding a ``{kind, text, ...payload}`` Quantity, mirroring how
``load`` is already typed (0010). Every existing row is backfilled from its integer
``reps`` as a ``repetitions`` Quantity — a ``reps`` of 5 becomes
``{"kind": "repetitions", "text": "5", "count": 5}`` — so the meaning is fixed once with
no data loss, and the now-redundant ``reps`` integer column is retired.

The downgrade is lossless in the other direction: it re-adds the ``reps`` column and
unwraps each Quantity's ``count`` back into it (a non-rep amount, which cannot exist
before this migration, would restore as 0).

Revision ID: 0020_typed_quantity
Revises: 0019_seed_common_movements
Create Date: 2026-07-26
"""
from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.domain.quantity import Quantity, QuantityKind, repetitions_of

revision: str = "0020_typed_quantity"
down_revision: str | None = "0019_seed_common_movements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "logged_set"


def _backfill_quantity_from_reps() -> None:
    """Write each row's ``quantity`` from its integer ``reps`` as a repetitions Quantity."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, reps FROM {_TABLE} WHERE reps IS NOT NULL")
    ).fetchall()
    for row in rows:
        quantity = Quantity(
            kind=QuantityKind.REPETITIONS, text=str(row.reps), count=int(row.reps)
        )
        bind.execute(
            sa.text(f"UPDATE {_TABLE} SET quantity = :value WHERE id = :id"),
            {"value": json.dumps(quantity.to_dict()), "id": row.id},
        )


def _backfill_reps_from_quantity() -> None:
    """Unwrap each ``quantity``'s rep count back into the ``reps`` column (lossless)."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, quantity FROM {_TABLE} WHERE quantity IS NOT NULL")
    ).fetchall()
    for row in rows:
        stored = row.quantity if isinstance(row.quantity, dict) else json.loads(row.quantity)
        # A non-rep amount cannot exist before this migration; restore it as 0 reps.
        reps = repetitions_of(stored) or 0
        bind.execute(
            sa.text(f"UPDATE {_TABLE} SET reps = :value WHERE id = :id"),
            {"value": reps, "id": row.id},
        )


def upgrade() -> None:
    # Add the JSON column, backfill every row from its integer reps, then drop reps.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("quantity", sa.JSON(), nullable=True))
    _backfill_quantity_from_reps()
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("reps")


def downgrade() -> None:
    # Re-add reps (nullable while backfilling), unwrap each Quantity into it, drop quantity.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("reps", sa.Integer(), nullable=True))
    _backfill_reps_from_quantity()
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column("reps", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("quantity")
