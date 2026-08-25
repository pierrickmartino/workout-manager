"""add a user-given Session Name to the standalone Session (issue #394)

Gives ``workout_session`` a nullable ``name`` column holding the user-given **Session
Name** (CONTEXT: Session Name). Nullable by design and **not** backfilled: an existing
Session that was never named keeps NULL, and read paths fall back to a derived
``training_type · date`` label (``app.domain.session_naming.session_label``) — the same
no-backfill pattern as the Protocol's ``name`` (0016). Distinct from ``title`` (a
Protocol member's descriptive Week/Day label). Set, edited, and cleared through the
Session rename endpoint; carried verbatim across Duplicate and Redeem.

Revision ID: 0030_session_name
Revises: 0029_keep_screen_awake
Create Date: 2026-08-25
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030_session_name"
down_revision: str | None = "0029_keep_screen_awake"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workout_session",
        sa.Column("name", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workout_session", "name")
