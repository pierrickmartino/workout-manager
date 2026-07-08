"""add default rest-timer duration to the Fitness Profile (F5 Slice 4)

Gives ``profile`` a nullable ``default_rest_seconds`` column holding the user's
preferred default rest-timer duration in whole seconds. Nullable by design: an
existing user who never sets one keeps NULL, and the Live Session's rest countdown
falls back to each Exercise Prescription's own ``rest_seconds``. No backfill — a
NULL simply means "no default set". An independent settings value, not part of the
gamification projection (ADR-0019).

Revision ID: 0015_default_rest_seconds
Revises: 0014_muscle_emphasis_split
Create Date: 2026-07-08
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_default_rest_seconds"
down_revision: str | None = "0014_muscle_emphasis_split"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "profile",
        sa.Column("default_rest_seconds", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("profile", "default_rest_seconds")
