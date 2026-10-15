"""generation_call: the admin AI audit log (ADR-0135, issue #730)

Adds the ``generation_call`` table, where the Postgres recorder stores every metered
Generation Call: when, which generator, which user (null for a system call), the provider
and model, token counts (null when unreported), latency, outcome, and the full prompts and
output. ``created_at`` is indexed for the newest-first read and the retention purge;
``clerk_user_id`` is indexed for per-user erasure.

No backfill: nothing was recorded before (Langfuse was never deployed), so the log starts
empty. Rows live for the 3-day retention window only. The downgrade drops the table.

Revision ID: 0051_generation_call
Revises: 0050_seed_tiered_exercises
Create Date: 2026-10-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0051_generation_call"
down_revision: str | None = "0050_seed_tiered_exercises"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "generation_call"


def upgrade() -> None:
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("generator_kind", sa.String(), nullable=False),
        sa.Column("clerk_user_id", sa.String(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("user_prompt", sa.Text(), nullable=False),
        sa.Column("output_text", sa.Text(), nullable=True),
    )
    op.create_index("ix_generation_call_created_at", _TABLE, ["created_at"])
    op.create_index("ix_generation_call_clerk_user_id", _TABLE, ["clerk_user_id"])


def downgrade() -> None:
    op.drop_index("ix_generation_call_clerk_user_id", table_name=_TABLE)
    op.drop_index("ix_generation_call_created_at", table_name=_TABLE)
    op.drop_table(_TABLE)
