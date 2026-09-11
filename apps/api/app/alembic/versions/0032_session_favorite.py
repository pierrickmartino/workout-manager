"""mark a standalone Session as a per-user Favorite (issue #396)

Adds the ``session_favorite`` table — a per-user relationship keyed by
``(clerk_user_id, session_id)`` holding a user's **Favorite** marker on one of their own
standalone Sessions (CONTEXT: Favorite). A stored *preference*, the same species as a
Pinned Target or an Interface Preference — the no-stored-ledger rule (ADR-0018) governs
*derived* facts, never user choices.

There is **no backfill**: a Favorite is born absent, so every pre-existing Session simply
reads un-favorited until its owner marks it. Presence of a row means favorited; absence
means not. The unique constraint on ``(clerk_user_id, session_id)`` keeps the mark
idempotent, and modeling it per (user, session) is what makes it **per-copy**: a duplicated
or redeemed copy is a new ``session_id`` with no row here, so it starts un-favorited for its
new owner.

Revision ID: 0032_session_favorite
Revises: 0031_session_author
Create Date: 2026-08-25
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032_session_favorite"
down_revision: str | None = "0031_session_author"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "session_favorite",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("clerk_user_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["workout_session.id"]),
        sa.UniqueConstraint(
            "clerk_user_id", "session_id", name="uq_session_favorite_user_session"
        ),
    )
    op.create_index(
        "ix_session_favorite_clerk_user_id",
        "session_favorite",
        ["clerk_user_id"],
    )
    op.create_index(
        "ix_session_favorite_session_id",
        "session_favorite",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_session_favorite_session_id", table_name="session_favorite")
    op.drop_index("ix_session_favorite_clerk_user_id", table_name="session_favorite")
    op.drop_table("session_favorite")
