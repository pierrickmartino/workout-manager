"""share a standalone Session by a revocable, reusable Share Link (issue #398)

Adds the ``share_link`` table — the token a **Share** produces (CONTEXT: Share Link,
ADR-0057). Each row is an **unguessable** ``token`` referencing the sharer's standalone
``session_id``, held with the sharer (``clerk_user_id``) so revocation stays owner-scoped,
and a nullable ``revoked_at`` stamp (``NULL`` = active). Anyone holding the token may
**Redeem** it into an independent deep-copy they own, until the sharer revokes it;
revocation stops *future* Redeems only and never reaches copies already taken.

There is **no backfill** — sharing is a new capability, so every pre-existing Session
simply has no link until its owner creates one. The ``token`` is unique so a preview/redeem
lookup is exact; ``session_id`` is intentionally **not** unique (a Session accumulates
revoked links over its history, and the create path keeps at most one *active* link by
returning the existing active row).

Revision ID: 0033_share_link
Revises: 0032_session_favorite
Create Date: 2026-08-26
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033_share_link"
down_revision: str | None = "0032_session_favorite"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "share_link",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("clerk_user_id", sa.String(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["workout_session.id"]),
        sa.UniqueConstraint("token", name="uq_share_link_token"),
    )
    op.create_index("ix_share_link_token", "share_link", ["token"], unique=True)
    op.create_index("ix_share_link_session_id", "share_link", ["session_id"])
    op.create_index("ix_share_link_clerk_user_id", "share_link", ["clerk_user_id"])


def downgrade() -> None:
    op.drop_index("ix_share_link_clerk_user_id", table_name="share_link")
    op.drop_index("ix_share_link_session_id", table_name="share_link")
    op.drop_index("ix_share_link_token", table_name="share_link")
    op.drop_table("share_link")
