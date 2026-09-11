"""add keep_screen_awake to appearance_preference (Interface Preference facet)

Grows the Appearance Preference store into the whole **Interface Preference**
(ADR-0055) by adding the behavioural facet: a ``keep_screen_awake`` boolean on
``appearance_preference``. It defaults **on** — the expected gym behaviour so a
Live Session keeps the screen on without the user first finding a toggle.

The ``server_default`` of true backfills every existing row, so a returning user
who already picked a Mode keeps that Mode and gains Keep-Screen-Awake on, never
disturbed (ADR-0047). The model default drives application writes. This is
read-time UI state only and never enters generation or the cache key (ADR-0047).

The downgrade drops the column, reverting the store to the Mode-only Appearance
Preference; the ``mode`` column it sat beside is untouched, so nothing else is
lost in either direction.

Revision ID: 0029_keep_screen_awake
Revises: 0028_pin_rep_target
Create Date: 2026-08-24
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029_keep_screen_awake"
down_revision: str | None = "0028_pin_rep_target"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "appearance_preference"


def upgrade() -> None:
    # batch mode keeps the column add portable across backends (ALTER on
    # PostgreSQL, table-rebuild on SQLite). The server default backfills every
    # existing row to the on-by-default value; the model default drives writes.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(
            sa.Column(
                "keep_screen_awake",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("keep_screen_awake")
