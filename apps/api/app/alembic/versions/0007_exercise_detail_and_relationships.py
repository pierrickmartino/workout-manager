"""enrich exercise detail and add typed exercise relationships

Adds the Slice 11 catalog enrichment: ``instructions``, ``difficulty``, and
``precautions`` columns on ``exercise`` (surfaced on the Exercise detail page),
and the ``exercise_relationship`` table — the typed ``variation``/``alternative``
links between catalog Exercises that Substitution resolves over, lookup-first,
before any AI fallback. The new ``exercise`` columns are nullable / default-empty
so existing catalog rows are unaffected.

Revision ID: 0007_exercise_detail_and_relationships
Revises: 0006_generation_feedback_and_regeneration
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0007_exercise_detail_and_relationships"
down_revision: str | None = "0006_generation_feedback_and_regeneration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("exercise") as batch:
        batch.add_column(
            sa.Column(
                "instructions", sqlmodel.sql.sqltypes.AutoString(), nullable=True
            )
        )
        batch.add_column(sa.Column("difficulty", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column(
                "precautions",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            )
        )

    op.create_table(
        "exercise_relationship",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("from_exercise_id", sa.Integer(), nullable=False),
        sa.Column("to_exercise_id", sa.Integer(), nullable=False),
        sa.Column("kind", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(["from_exercise_id"], ["exercise.id"]),
        sa.ForeignKeyConstraint(["to_exercise_id"], ["exercise.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exercise_relationship_from_exercise_id",
        "exercise_relationship",
        ["from_exercise_id"],
        unique=False,
    )
    op.create_index(
        "ix_exercise_relationship_to_exercise_id",
        "exercise_relationship",
        ["to_exercise_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_exercise_relationship_to_exercise_id",
        table_name="exercise_relationship",
    )
    op.drop_index(
        "ix_exercise_relationship_from_exercise_id",
        table_name="exercise_relationship",
    )
    op.drop_table("exercise_relationship")

    with op.batch_alter_table("exercise") as batch:
        batch.drop_column("precautions")
        batch.drop_column("difficulty")
        batch.drop_column("instructions")
