"""create exercise catalog and standalone session tables

Adds the Slice 3 entities: the shared ``exercise`` catalog (deduped by a unique
``normalized_name`` and flagged with ``provenance``), the user-owned
``workout_session``, and the ``exercise_prescription`` rows that compose a Session
and reference a catalog Exercise.

Revision ID: 0003_session_generation
Revises: 0002_full_fitness_profile
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0003_session_generation"
down_revision: str | None = "0002_full_fitness_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exercise",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "normalized_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False
        ),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("provenance", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "targeted_muscles",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "required_equipment",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exercise_normalized_name",
        "exercise",
        ["normalized_name"],
        unique=True,
    )

    op.create_table(
        "workout_session",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("training_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_workout_session_clerk_user_id",
        "workout_session",
        ["clerk_user_id"],
        unique=False,
    )

    op.create_table(
        "exercise_prescription",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("sets", sa.Integer(), nullable=False),
        sa.Column("reps", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=True),
        sa.Column("tempo", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column(
            "recommended_load", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
        sa.ForeignKeyConstraint(["session_id"], ["workout_session.id"]),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercise.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exercise_prescription_session_id",
        "exercise_prescription",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        "ix_exercise_prescription_exercise_id",
        "exercise_prescription",
        ["exercise_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_exercise_prescription_exercise_id", table_name="exercise_prescription"
    )
    op.drop_index(
        "ix_exercise_prescription_session_id", table_name="exercise_prescription"
    )
    op.drop_table("exercise_prescription")
    op.drop_index(
        "ix_workout_session_clerk_user_id", table_name="workout_session"
    )
    op.drop_table("workout_session")
    op.drop_index("ix_exercise_normalized_name", table_name="exercise")
    op.drop_table("exercise")
