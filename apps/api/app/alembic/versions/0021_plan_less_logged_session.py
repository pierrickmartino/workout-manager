"""let a Logged Session stand alone: nullable session_id + denormalized training_type (ADR-0031)

Frees the *record* side from a mandatory plan (ADR-0031). ``logged_session.session_id``
becomes nullable so a plan-less record — an ad-hoc run nobody prescribed — can exist
with no Session behind it. A new, always-populated ``training_type`` column moves the
training type off the parent Session and onto the record: every existing row is
backfilled from its Session's ``training_type`` (all pre-migration rows are plan-backed,
so all resolve), and the read paths then take the type off the row instead of joining
back through a parent that a plan-less record does not have.

The downgrade assumes no plan-less rows were written (they cannot exist before this
migration): it re-imposes the NOT NULL on ``session_id`` and drops ``training_type``.

Revision ID: 0021_plan_less_logged_session
Revises: 0020_typed_quantity
Create Date: 2026-07-26
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_plan_less_logged_session"
down_revision: str | None = "0020_typed_quantity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "logged_session"


def _backfill_training_type_from_session() -> None:
    """Copy each row's training type from its prescribing Session (all rows plan-backed)."""

    op.get_bind().execute(
        sa.text(
            f"UPDATE {_TABLE} SET training_type = ("
            "  SELECT ws.training_type FROM workout_session AS ws"
            f"  WHERE ws.id = {_TABLE}.session_id"
            ")"
        )
    )


def upgrade() -> None:
    # Add training_type (nullable while backfilling) and relax the session_id FK.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("training_type", sa.String(), nullable=True))
        batch.alter_column("session_id", existing_type=sa.Integer(), nullable=True)
    _backfill_training_type_from_session()
    # Every row now carries its training type; make the column always-populated.
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column("training_type", existing_type=sa.String(), nullable=False)


def downgrade() -> None:
    # Re-impose the mandatory plan pointer and drop the denormalized training type.
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column("session_id", existing_type=sa.Integer(), nullable=False)
        batch.drop_column("training_type")
