"""pin a user-set bodyweight rep target that suspends read-time Progression (ADR-0053)

Adds an additive, nullable ``pinned_reps`` text column to ``exercise_prescription`` — the
persistence spine of the Pin feature (#369). Its *presence* is the user-set marker: when a
user Pins a rep range onto a bodyweight Prescription's next un-performed occurrence, the range
text lands here, and the read-time Progression overlay (``app/protocols/progress.py``) surfaces
it verbatim and stops stepping that movement until the pin is cleared (un-pin sets the column
back to NULL).

The column is purely additive — every existing Prescription reads NULL and behaves exactly as
before, with automatic Progression governing its rep target — so the upgrade needs no backfill
and the downgrade simply drops it, losing nothing (the base ``reps`` target it suspended is a
separate column, untouched).

Revision ID: 0028_pin_rep_target
Revises: 0027_prescribed_quantity
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028_pin_rep_target"
down_revision: str | None = "0027_prescribed_quantity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_prescription"


def upgrade() -> None:
    # Additive, nullable marker column: NULL means "no pin, Progression governs".
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("pinned_reps", sa.String(), nullable=True))


def downgrade() -> None:
    # Purely additive: drop the marker. The base ``reps`` target it suspended is a
    # separate column and is untouched, so nothing is lost in either direction.
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("pinned_reps")
