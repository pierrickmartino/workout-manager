"""create generation_feedback table and add regeneration guard

Adds the Slice 10 entities: the ``generation_feedback`` table — the user's
``positive``/``negative`` verdict on a generated/adopted Session with an optional
free-text ``reason``, persisted distinctly from Performance Feedback — and the
``has_been_regenerated`` guard column on ``workout_session`` enforcing the
once-per-Session regeneration limit. The new column defaults to false so existing
Sessions are unaffected.

Revision ID: 0006_generation_feedback_and_regeneration
Revises: 0005_program_generation
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0006_generation_feedback_and_regeneration"
down_revision: str | None = "0005_program_generation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Alembic creates ``alembic_version.version_num`` as VARCHAR(32) by default,
    # but our descriptive revision identifiers (this one is 41 chars) exceed that
    # and overflow the column on PostgreSQL when the revision is recorded. Widen
    # it here — before Alembic stamps this revision — so this and every later
    # revision can be written. SQLite ignores VARCHAR length, so guard on dialect.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "ALTER TABLE alembic_version "
            "ALTER COLUMN version_num TYPE VARCHAR(255)"
        )

    op.create_table(
        "generation_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("verdict", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["workout_session.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_generation_feedback_clerk_user_id",
        "generation_feedback",
        ["clerk_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_generation_feedback_session_id",
        "generation_feedback",
        ["session_id"],
        unique=False,
    )

    # batch mode keeps the column add portable across backends (ALTER on
    # PostgreSQL, table-rebuild on SQLite). A server default backfills existing
    # rows; the model default drives application writes.
    with op.batch_alter_table("workout_session") as batch:
        batch.add_column(
            sa.Column(
                "has_been_regenerated",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_column("has_been_regenerated")

    op.drop_index(
        "ix_generation_feedback_session_id", table_name="generation_feedback"
    )
    op.drop_index(
        "ix_generation_feedback_clerk_user_id", table_name="generation_feedback"
    )
    op.drop_table("generation_feedback")
