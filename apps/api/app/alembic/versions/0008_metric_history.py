"""create metric history table

Adds the Slice 12 metric time series: ``metric_entry`` records a user's dated
body-metric readings (weight, body-fat, waist, …) so progress can be reviewed over
time. This is deliberately distinct from the Fitness Profile snapshot — the
Profile stays a mutable "now" and is never written by these rows.

Revision ID: 0008_metric_history
Revises: 0007_exercise_detail_and_relationships
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0008_metric_history"
down_revision: str | None = "0007_exercise_detail_and_relationships"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "metric_entry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("metric", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("recorded_on", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_metric_entry_clerk_user_id",
        "metric_entry",
        ["clerk_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_metric_entry_metric",
        "metric_entry",
        ["metric"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_metric_entry_metric", table_name="metric_entry")
    op.drop_index("ix_metric_entry_clerk_user_id", table_name="metric_entry")
    op.drop_table("metric_entry")
