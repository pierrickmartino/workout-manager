"""add Session Provenance to workout_session (CONTEXT.md, ADR-0040)

Adds a non-null ``provenance`` column to ``workout_session`` recording how the plan came
to exist: ``ai_generated`` (the generation pipeline) or ``user_authored`` (a
Hand-Authored Session, built by hand with no AI). Every Session that exists today was
AI-produced, so a server default of ``ai_generated`` backfills every pre-existing row;
the model default drives application writes going forward. ``user_authored`` arrives with
the Hand-Authored Session feature that builds on this column — this slice only lays the
column down (no user-facing behavior change).

Revision ID: 0023_session_provenance
Revises: 0022_generation_trace_id
Create Date: 2026-08-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_session_provenance"
down_revision: str | None = "0022_generation_trace_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # batch mode keeps the column add portable across backends (ALTER on PostgreSQL,
    # table-rebuild on SQLite). The server default backfills existing rows to
    # ``ai_generated``; the model default drives application writes.
    with op.batch_alter_table("workout_session") as batch:
        batch.add_column(
            sa.Column(
                "provenance",
                sa.String(),
                nullable=False,
                server_default="ai_generated",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_column("provenance")
