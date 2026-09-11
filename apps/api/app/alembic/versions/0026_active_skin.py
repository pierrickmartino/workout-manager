"""create app_setting table and seed the Active Skin = PULSE

Adds the generic ``app_setting`` key/value store and seeds the single global
Active Skin row (``active_skin`` = ``pulse``) — the codebase's first piece of
global, mutable app state (ADR-0048). Seeding the default means a fresh deploy
already has an explicit Active Skin row; the repository still defaults to PULSE
when the row is absent, so the two can never disagree on the starting value.

Unlike the per-user tables this row is *not* keyed by ``clerk_user_id``: the
Active Skin is one app-wide value changed only by an admin publishing.

The downgrade drops the table.

Revision ID: 0026_active_skin
Revises: 0025_appearance_preference
Create Date: 2026-08-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0026_active_skin"
down_revision: str | None = "0025_appearance_preference"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The default Active Skin seeded on upgrade. Kept as a literal (not imported from
# app.domain.skin) so the migration stays a stable historical record even if the
# catalog's default is ever changed in code — migrations describe the schema at a
# point in time, not the current codebase.
_DEFAULT_ACTIVE_SKIN = "pulse"
_ACTIVE_SKIN_KEY = "active_skin"


def upgrade() -> None:
    app_setting = op.create_table(
        "app_setting",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("value", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_app_setting_key",
        "app_setting",
        ["key"],
        unique=True,
    )
    # Seed the single global Active Skin row (ADR-0048).
    op.bulk_insert(
        app_setting,
        [{"key": _ACTIVE_SKIN_KEY, "value": _DEFAULT_ACTIVE_SKIN}],
    )


def downgrade() -> None:
    op.drop_index("ix_app_setting_key", table_name="app_setting")
    op.drop_table("app_setting")
