"""create appearance_preference table (per-user Mode)

Adds the ``appearance_preference`` store: one row per user (keyed by
``clerk_user_id``) holding their chosen Mode. Deliberately a *separate* table
from ``profile`` (ADR-0047) so appearance never enters generation or the
generation cache key.

Absence of a row is the default (Dark), so no row is seeded on migrate and no
existing user is light-flipped — the table starts empty and only ever gains a
row when a user makes a deliberate choice.

The downgrade drops the table, leaving the Fitness Profile untouched.

Revision ID: 0025_appearance_preference
Revises: 0024_exercise_image
Create Date: 2026-08-15
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0025_appearance_preference"
down_revision: str | None = "0024_exercise_image"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "appearance_preference",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("mode", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_appearance_preference_clerk_user_id",
        "appearance_preference",
        ["clerk_user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_appearance_preference_clerk_user_id",
        table_name="appearance_preference",
    )
    op.drop_table("appearance_preference")
