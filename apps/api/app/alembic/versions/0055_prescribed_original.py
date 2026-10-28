"""add prescribed_original to exercise_prescription (Prescribed Original, issue #788)

Grows the Exercise Prescription with a nullable JSON ``prescribed_original``: the
Exercise, Load and Progression Scheme the first Substitution snapshots so Restore
can put them back (ADR-0143).

There is no backfill and no server default. Every existing row carries NULL, which
reads as "never substituted", so nothing changes on deploy. The column is plan-only
state of the user's own copy, never carried into a copy of the plan.

The downgrade drops the column; a held snapshot is lost and the substituted
movement simply stays as it is.

Revision ID: 0055_prescribed_original
Revises: 0054_avatar
Create Date: 2026-10-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0055_prescribed_original"
down_revision: str | None = "0054_avatar"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_prescription"


def upgrade() -> None:
    # batch mode keeps the column add portable across backends (ALTER on
    # PostgreSQL, table-rebuild on SQLite).
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("prescribed_original", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("prescribed_original")
