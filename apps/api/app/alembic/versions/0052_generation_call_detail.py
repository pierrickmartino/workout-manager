"""generation_call detail: error message, schema name, token budget (issue #731)

Adds three nullable columns to the admin AI audit log so the call detail view can explain
a call: ``error_message`` (a failed call's ``GenerationError`` text, capped at about 2 KB),
``schema_name`` (the requested output schema) and ``max_tokens`` (the token budget, so a
cut-off output is obvious).

All three are nullable: rows recorded before this revision have none of them, and they
expire within the 3-day retention window anyway, so there is no backfill. The downgrade
drops the columns.

Revision ID: 0052_generation_call_detail
Revises: 0051_generation_call
Create Date: 2026-10-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0052_generation_call_detail"
down_revision: str | None = "0051_generation_call"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "generation_call"


def upgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("error_message", sa.Text(), nullable=True))
        batch.add_column(sa.Column("schema_name", sa.String(), nullable=True))
        batch.add_column(sa.Column("max_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("max_tokens")
        batch.drop_column("schema_name")
        batch.drop_column("error_message")
