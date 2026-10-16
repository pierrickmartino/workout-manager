"""drop the Generation Call trace id lineage from Protocol and Session (issue #734)

0022 added a nullable ``trace_id`` on ``protocol`` and ``workout_session`` so feedback could
trace a plan back to the Generation Call that produced it. The AI audit log now keeps a call
for 3 days (ADR-0135), so a stored id would point at nothing within days, and nothing reads
it. Both columns are dropped.

The downgrade restores both columns as nullable. The dropped values are not recoverable, so
every row carries NULL, the same posture 0022 had for pre-lineage rows.

Revision ID: 0053_drop_trace_id
Revises: 0052_generation_call_detail
Create Date: 2026-10-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0053_drop_trace_id"
down_revision: str | None = "0052_generation_call_detail"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("protocol", "workout_session")
_COLUMN = "trace_id"


def upgrade() -> None:
    for table in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column(_COLUMN)


def downgrade() -> None:
    for table in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column(_COLUMN, sa.String(), nullable=True))
