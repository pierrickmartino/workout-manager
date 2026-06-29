"""extend profile into the full fitness profile

Adds the demographic scalars and the three JSON collections (default
equipment, per-training-type fitness levels, preferences, and sensitive
constraints). The ``is_sensitive`` bypass gate is derived from
``sensitive_constraints`` at read time and is intentionally not a column.

Revision ID: 0002_full_fitness_profile
Revises: 0001_create_profile
Create Date: 2026-06-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0002_full_fitness_profile"
down_revision: str | None = "0001_create_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column("gender", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.add_column("profile", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("profile", sa.Column("height_cm", sa.Float(), nullable=True))
    op.add_column("profile", sa.Column("weight_kg", sa.Float(), nullable=True))
    op.add_column(
        "profile",
        sa.Column(
            "training_habits", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    op.add_column(
        "profile",
        sa.Column(
            "recent_workout", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
    )
    op.add_column(
        "profile",
        sa.Column(
            "default_equipment",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "profile",
        sa.Column(
            "fitness_levels",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    op.add_column(
        "profile",
        sa.Column(
            "preferences",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "profile",
        sa.Column(
            "sensitive_constraints",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("profile", "sensitive_constraints")
    op.drop_column("profile", "preferences")
    op.drop_column("profile", "fitness_levels")
    op.drop_column("profile", "default_equipment")
    op.drop_column("profile", "recent_workout")
    op.drop_column("profile", "training_habits")
    op.drop_column("profile", "weight_kg")
    op.drop_column("profile", "height_cm")
    op.drop_column("profile", "age")
    op.drop_column("profile", "gender")
