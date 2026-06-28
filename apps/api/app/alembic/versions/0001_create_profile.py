"""create profile table

Revision ID: 0001_create_profile
Revises:
Create Date: 2026-06-28
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001_create_profile"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("display_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_profile_clerk_user_id",
        "profile",
        ["clerk_user_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_profile_clerk_user_id", table_name="profile")
    op.drop_table("profile")
