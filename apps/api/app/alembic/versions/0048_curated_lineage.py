"""curated lineage on Protocols and Sessions (ADR-0130, issue #688)

Adds ``curated_identifier``, ``curated_version`` and ``curated_name`` to ``protocol`` and
``workout_session``: which Curated Protocol, and which version, an adopted plan came from,
plus its name as adopted for the "Based on" label. All three are nullable and never
backfilled: every existing row was adopted from a Generated Protocol or authored by hand,
and so has no curated lineage.

Revision ID: 0048_curated_lineage
Revises: 0047_protocol_made_current_at_nullable
Create Date: 2026-10-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0048_curated_lineage"
down_revision: str | None = "0047_protocol_made_current_at_nullable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ("protocol", "workout_session")


def upgrade() -> None:
    for table in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("curated_identifier", sa.String(), nullable=True))
            batch.add_column(sa.Column("curated_version", sa.Integer(), nullable=True))
            batch.add_column(sa.Column("curated_name", sa.String(), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_column("curated_name")
            batch.drop_column("curated_version")
            batch.drop_column("curated_identifier")
