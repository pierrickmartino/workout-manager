"""add Superset grouping columns to the Exercise Prescription (issue #153, ADR-0023)

Gives ``exercise_prescription`` two nullable columns that overlay Supersets on the
flat Prescription list (ADR-0023): ``superset_group`` — the group tag members of one
Superset share (an ordered, contiguous run) — and ``round_rest_seconds`` — the single
group-owned round-rest, denormalized onto each member so it is reorder-stable. Both
NULL for a flat, solo Prescription. Additive and nullable by design: every existing
Protocol reads and deploys unchanged, ungrouped, with no backfill. A grouped member's
own ``rest_seconds`` stays put (dormant while grouped, restored on ungroup).

Revision ID: 0017_supersets
Revises: 0016_protocol_name
Create Date: 2026-07-18
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_supersets"
down_revision: str | None = "0016_protocol_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "exercise_prescription",
        sa.Column("superset_group", sa.String(), nullable=True),
    )
    op.add_column(
        "exercise_prescription",
        sa.Column("round_rest_seconds", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("exercise_prescription", "round_rest_seconds")
    op.drop_column("exercise_prescription", "superset_group")
