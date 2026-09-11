"""add weight_unit to appearance_preference (Interface Preference facet)

Grows the Interface Preference store (ADR-0055) with the **Weight Unit** facet: a
``weight_unit`` string on ``appearance_preference``. It defaults **kg** — the app's
canonical storage unit — so existing behaviour is unchanged (CONTEXT "Weight Unit").

The ``server_default`` of ``'kg'`` backfills every existing row, so a returning user
who already picked a Mode / Keep-Screen-Awake keeps those and gains kilograms, never
disturbed (ADR-0047). The model default drives application writes. This is read-time
UI state only and never enters generation or the cache key (ADR-0047).

The downgrade drops the column, reverting the store to Mode + Keep Screen Awake; the
columns it sat beside are untouched, so nothing else is lost in either direction.

Revision ID: 0034_weight_unit
Revises: 0033_share_link
Create Date: 2026-08-30
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0034_weight_unit"
down_revision: str | None = "0033_share_link"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "appearance_preference"


def upgrade() -> None:
    # batch mode keeps the column add portable across backends (ALTER on
    # PostgreSQL, table-rebuild on SQLite). The server default backfills every
    # existing row to the canonical kilograms; the model default drives writes.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(
            sa.Column(
                "weight_unit",
                sa.String(),
                nullable=False,
                server_default="kg",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("weight_unit")
