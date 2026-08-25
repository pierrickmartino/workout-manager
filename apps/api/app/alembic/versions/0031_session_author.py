"""attribute a Session's human Author, backfilled to the owner (issue #395)

Gives ``workout_session`` a nullable ``author_clerk_user_id`` column holding a reference
to the **human who first created** the plan (CONTEXT: Author) — a distinct axis from both
the Owner (``clerk_user_id``) and Session Provenance (``ai_generated`` / ``user_authored``).

Unlike ``name`` (0030), the Author **is** backfilled: every pre-existing row is attributed
to its current owner, so no Session reads as authorless. New rows are stamped with the
creating user at every creation path, and the reference is carried verbatim across Duplicate
(and, later, Redeem) — immutable origin, the same non-re-attribution as Provenance and the
``trace_id`` lineage. The column stays nullable so the add + backfill is a two-step online
migration and a defensive read still resolves a generic label for any null.

Revision ID: 0031_session_author
Revises: 0030_session_name
Create Date: 2026-08-25
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031_session_author"
down_revision: str | None = "0030_session_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workout_session",
        sa.Column("author_clerk_user_id", sa.String(), nullable=True),
    )
    # Backfill the Author of every pre-existing row to its current owner, so no Session
    # reads as authorless (issue #395). A self-authored/generated Session attributes to the
    # user who holds it; there is no earlier creator to credit for rows made before Author
    # existed.
    op.execute(
        "UPDATE workout_session "
        "SET author_clerk_user_id = clerk_user_id "
        "WHERE author_clerk_user_id IS NULL"
    )


def downgrade() -> None:
    op.drop_column("workout_session", "author_clerk_user_id")
