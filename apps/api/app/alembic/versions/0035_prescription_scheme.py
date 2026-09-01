"""persist a per-Prescription Progression Scheme selection (ADR-0064)

Adds an additive, nullable ``scheme`` text column to ``exercise_prescription`` — the
persistence spine of Selectable Progression Schemes (#429). Its value is the chosen
``ProgressionScheme`` (e.g. ``"static"``); the read-time Progression overlay
(``app/protocols/progress.py``) resolves it and dispatches to the scheme registry, with
NULL meaning "no choice" — which resolves to the system default (Double Progression) and
reproduces today's behaviour exactly.

This is the *expand* step (nothing is removed): the existing ``pinned_reps`` column keeps
working alongside the new selection; retiring Pin is a later change (#434). The column is
purely additive — every existing Prescription reads NULL and behaves exactly as before, so
the upgrade needs no backfill and touches no existing data, and the downgrade simply drops
it, losing nothing (the base ``reps``/``recommended_load`` the overlay steps are separate
columns, untouched).

Revision ID: 0035_prescription_scheme
Revises: 0034_weight_unit
Create Date: 2026-09-01
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0035_prescription_scheme"
down_revision: str | None = "0034_weight_unit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_prescription"


def upgrade() -> None:
    # Additive, nullable selection column: NULL means "no choice → the default scheme".
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("scheme", sa.String(), nullable=True))


def downgrade() -> None:
    # Purely additive: drop the selection. The base reps/load the overlay steps live in
    # separate columns and are untouched, so nothing is lost in either direction.
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("scheme")
