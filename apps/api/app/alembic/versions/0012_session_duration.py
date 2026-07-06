"""add Session Duration to Logged Sessions (ADR-0014)

Gives ``logged_session`` a nullable ``duration_seconds`` column holding the actual
training time of a live-tracked performance — whole seconds measured start → last
activity, so idle gaps are excluded. Nullable by design: a performance logged after
the fact through the static form never measures a duration, and existing rows stay
NULL. No backfill — a NULL simply means "duration unknown".

Revision ID: 0012_session_duration
Revises: 0011_completion_outcome
Create Date: 2026-07-06
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_session_duration"
down_revision: str | None = "0011_completion_outcome"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "logged_session",
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("logged_session", "duration_seconds")
