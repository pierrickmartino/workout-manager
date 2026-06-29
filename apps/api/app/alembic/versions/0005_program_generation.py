"""create program table and link sessions to programs

Adds the Slice 5 entities: the user-owned ``program`` (a deep-copied, mutable
adoption of a Generated Program carrying the full parameter set) and the Program
linkage columns on the unified ``workout_session`` — ``program_id`` plus the
descriptive ``week``/``day``/``position``/``title``/``objective`` that place a
Session in its Program's self-paced sequence. All linkage columns are nullable so
a standalone Session (Slices 3-4) is unchanged.

Revision ID: 0005_program_generation
Revises: 0004_session_logging
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0005_program_generation"
down_revision: str | None = "0004_session_logging"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "program",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("training_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("objective", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("sessions_per_week", sa.Integer(), nullable=False),
        sa.Column("weeks", sa.Integer(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_program_clerk_user_id", "program", ["clerk_user_id"], unique=False
    )

    # batch mode keeps the column adds, index, and FK portable across backends
    # (ALTER on PostgreSQL, table-rebuild on SQLite).
    with op.batch_alter_table("workout_session") as batch:
        batch.add_column(sa.Column("program_id", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column("objective", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )
        batch.add_column(sa.Column("week", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("day", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("position", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )
        batch.create_index(
            "ix_workout_session_program_id", ["program_id"], unique=False
        )
        batch.create_foreign_key(
            "fk_workout_session_program_id",
            "program",
            ["program_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_constraint("fk_workout_session_program_id", type_="foreignkey")
        batch.drop_index("ix_workout_session_program_id")
        batch.drop_column("title")
        batch.drop_column("position")
        batch.drop_column("day")
        batch.drop_column("week")
        batch.drop_column("objective")
        batch.drop_column("program_id")

    op.drop_index("ix_program_clerk_user_id", table_name="program")
    op.drop_table("program")
