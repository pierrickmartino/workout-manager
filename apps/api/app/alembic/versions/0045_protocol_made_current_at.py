"""add the made-Current choice to the Protocol (ADR-0125)

Gives ``protocol`` a non-null ``made_current_at`` timestamp: when the user last made this
Protocol their **Current Protocol** — by Adopting it, or (later) by Switching back to it. The
Current Protocol is now the user's unfinished Protocol with the latest ``made_current_at``,
ties broken by id, instead of the latest ``created_at`` (ADR-0125 amends ADR-0037).

Backfilled from ``created_at`` before it becomes non-null: until now every Protocol was made
Current exactly once, at adoption, so the two orders agree and every existing user's Current
Protocol is unchanged by the release.

A stored user *choice*, the same species as the Protocol's ``calibration`` (0044) or a
Session's ``favorite`` (0032) — not a derived ledger, which ADR-0018 forbids. It only orders
Protocols; it is never shown as a schedule (ADR-0001).

Revision ID: 0045_protocol_made_current_at
Revises: 0044_protocol_calibration
Create Date: 2026-10-09
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0045_protocol_made_current_at"
down_revision: str | None = "0044_protocol_calibration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "protocol"


def upgrade() -> None:
    op.add_column(_TABLE, sa.Column("made_current_at", sa.DateTime(), nullable=True))
    op.execute(sa.text("UPDATE protocol SET made_current_at = created_at"))
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column(
            "made_current_at", existing_type=sa.DateTime(), nullable=False
        )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("made_current_at")
