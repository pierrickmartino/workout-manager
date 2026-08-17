"""type the Exercise Prescription amount axis as a Quantity and backfill from reps (ADR-0050)

Types the *plan* side's amount, mirroring how 0020 typed the record side: ``exercise_prescription``
gains an additive, nullable ``prescribed_quantity`` JSON column holding a ``{kind, text, ...payload}``
Quantity. Every existing row is backfilled from its free-text ``reps`` using the shared inference
primitive ``quantity_from_text`` (#341) — ``"7 KM"`` becomes a ``distance`` Quantity in canonical
metres, ``"30 min"`` a ``duration``, and a bare ``"5"`` or an unparseable amount defaults to
``repetitions`` — so a running Protocol generated *before* this change reads as typed ``distance``
without regenerating, and nothing about strength prescriptions changes.

The legacy free-text ``reps`` is deliberately retained (unlike 0020, which dropped the record-side
integer): it still renders the prescribed line, while ``prescribed_quantity`` becomes the source of
truth for the log input. The column is purely additive, so the downgrade simply drops it — the
verbatim ``reps`` the backfill read from is untouched, so no data is lost in either direction.

Revision ID: 0027_prescribed_quantity
Revises: 0026_active_skin
Create Date: 2026-08-17
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.domain.quantity import quantity_from_text

revision: str = "0027_prescribed_quantity"
down_revision: str | None = "0026_active_skin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_prescription"


def _backfill_quantity_from_reps() -> None:
    """Infer each row's ``prescribed_quantity`` from its free-text ``reps`` (#341).

    ``quantity_from_text`` always returns a Quantity — ``repetitions`` is the safe default —
    so a legacy or malformed target types gracefully rather than being skipped."""

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, reps FROM {_TABLE} WHERE reps IS NOT NULL")
    ).fetchall()
    for row in rows:
        quantity = quantity_from_text(row.reps)
        bind.execute(
            sa.text(f"UPDATE {_TABLE} SET prescribed_quantity = :value WHERE id = :id"),
            {"value": json.dumps(quantity.to_dict()), "id": row.id},
        )


def upgrade() -> None:
    # Add the additive JSON column, then type every existing row from its free-text reps.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("prescribed_quantity", sa.JSON(), nullable=True))
    _backfill_quantity_from_reps()


def downgrade() -> None:
    # Purely additive: drop the derived column. The free-text ``reps`` it was inferred from
    # is retained, so nothing is lost.
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("prescribed_quantity")
