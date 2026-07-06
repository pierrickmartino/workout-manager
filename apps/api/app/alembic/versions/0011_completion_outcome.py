"""add Completion Outcome to Logged Sessions (ADR-0013)

Gives ``logged_session`` a nullable ``completion_outcome`` column holding the
client-declared verdict — ``completed`` | ``incomplete`` — on whether every
prescribed set of the Session was attempted. Nullable by design: existing rows,
and any record logged without declaring an outcome, stay NULL, and only an explicit
``incomplete`` holds a Session as the Next Session (Protocol advancement keys off a
Completed log). No backfill — a NULL is treated as advancing, preserving ADR-0001's
prior "any log advances" behavior for records that predate this verdict.

Revision ID: 0011_completion_outcome
Revises: 0010_typed_load
Create Date: 2026-07-06
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0011_completion_outcome"
down_revision: str | None = "0010_typed_load"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "logged_session",
        sa.Column(
            "completion_outcome",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("logged_session", "completion_outcome")
