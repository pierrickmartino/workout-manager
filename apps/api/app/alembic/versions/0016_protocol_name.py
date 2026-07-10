"""add a user-editable name to the Protocol (F4 Slice 5)

Gives ``protocol`` a nullable ``name`` column holding the Protocol's user-editable
name (Pulse's "PROTOCOL ID", ADR-0021). Nullable by design: an existing adopted
Protocol that was never named keeps NULL, and read paths fall back to a derived
``objective · training_type`` label — so no backfill is needed. The name is edited
in the Builder's config panel and rides through the DEPLOY path.

Revision ID: 0016_protocol_name
Revises: 0015_default_rest_seconds
Create Date: 2026-07-10
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_protocol_name"
down_revision: str | None = "0015_default_rest_seconds"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "protocol",
        sa.Column("name", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("protocol", "name")
