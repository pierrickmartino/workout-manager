"""add avatar to appearance_preference (Interface Preference facet, issue #747)

Grows the Interface Preference store (ADR-0055) with the **Avatar** facet: a
nullable ``avatar`` string on ``appearance_preference`` holding a catalog id from
``app.domain.avatars`` (ADR-0136).

There is no server default. Every existing row carries NULL, which reads as the
default Novice, so a returning user keeps their other facets and sees no change on
deploy. The column stores only a user's choice; whether an Avatar is unlocked is
computed from the Operator Level and never stored (ADR-0018/0019).

The downgrade drops the column; the columns it sat beside are untouched.

Revision ID: 0054_avatar
Revises: 0053_drop_trace_id
Create Date: 2026-10-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0054_avatar"
down_revision: str | None = "0053_drop_trace_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "appearance_preference"


def upgrade() -> None:
    # batch mode keeps the column add portable across backends (ALTER on
    # PostgreSQL, table-rebuild on SQLite).
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("avatar", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("avatar")
