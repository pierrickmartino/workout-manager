"""carry the Generation Call trace id onto the Protocol and its Sessions (ADR-0039, #274)

Adds the operational AI-usage lineage the feedback story cannot backfill: a nullable
``trace_id`` on ``protocol`` and on ``workout_session``. The originating Generation
Call's trace id is stored on the Generated artifact, deep-copied onto the adopted
Protocol (and seeded onto each of its Sessions), and re-stamped on a Session when it is
Regenerated — so a later Generation-Feedback push can trace back to the exact call.

Both columns are nullable and never backfilled: a deployment with no monitoring backend
records no trace id, and every pre-migration Protocol/Session simply carries NULL. This
is operator telemetry, not a user-facing projection (ADR-0018/0019 is untouched). The
value is written once at creation and on Regeneration, never otherwise mutated.

Revision ID: 0022_generation_trace_id
Revises: 0021_plan_less_logged_session
Create Date: 2026-08-04
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_generation_trace_id"
down_revision: str | None = "0021_plan_less_logged_session"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("protocol", sa.Column("trace_id", sa.String(), nullable=True))
    op.add_column("workout_session", sa.Column("trace_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("workout_session", "trace_id")
    op.drop_column("protocol", "trace_id")
