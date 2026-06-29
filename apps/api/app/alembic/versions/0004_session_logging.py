"""create session logging tables

Adds the Slice 4 record-side entities: ``logged_session`` (a user-owned record of
performing a ``workout_session`` on a date) and ``logged_set`` (one actual set —
real reps, load, and an RPE-style perceived difficulty — referencing the catalog
Exercise performed). These reference the prescribing Session but never mutate it.

Revision ID: 0004_session_logging
Revises: 0003_session_generation
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0004_session_logging"
down_revision: str | None = "0003_session_generation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "logged_session",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("performed_on", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["workout_session.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_logged_session_clerk_user_id",
        "logged_session",
        ["clerk_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_logged_session_session_id",
        "logged_session",
        ["session_id"],
        unique=False,
    )

    op.create_table(
        "logged_set",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("logged_session_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("load", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("perceived_difficulty", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["logged_session_id"], ["logged_session.id"]),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercise.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_logged_set_logged_session_id",
        "logged_set",
        ["logged_session_id"],
        unique=False,
    )
    op.create_index(
        "ix_logged_set_exercise_id",
        "logged_set",
        ["exercise_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_logged_set_exercise_id", table_name="logged_set")
    op.drop_index("ix_logged_set_logged_session_id", table_name="logged_set")
    op.drop_table("logged_set")
    op.drop_index("ix_logged_session_session_id", table_name="logged_session")
    op.drop_index("ix_logged_session_clerk_user_id", table_name="logged_session")
    op.drop_table("logged_session")
