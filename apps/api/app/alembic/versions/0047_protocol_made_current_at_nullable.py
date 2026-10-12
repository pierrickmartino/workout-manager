"""let a Protocol be adopted set aside, never made Current (ADR-0130, ADR-0058)

Makes ``protocol.made_current_at`` nullable. A Curated Protocol adopted by a user with a
Sensitive Constraint arrives **set aside**: it has never been made Current, so it carries no
stamp, and Current Protocol selection (ADR-0125) passes it over until the user Switches to it.
Every existing row keeps its stamp, so no user's Current Protocol changes.

The downgrade backfills a missing stamp from ``created_at`` before restoring the constraint;
such a Protocol then competes for Current by its adoption instant, as every Protocol did
before this revision.

Revision ID: 0047_protocol_made_current_at_nullable
Revises: 0046_seed_curated_exercises
Create Date: 2026-10-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0047_protocol_made_current_at_nullable"
down_revision: str | None = "0046_seed_curated_exercises"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "protocol"


def upgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column("made_current_at", existing_type=sa.DateTime(), nullable=True)


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE protocol SET made_current_at = created_at WHERE made_current_at IS NULL"
        )
    )
    with op.batch_alter_table(_TABLE) as batch:
        batch.alter_column("made_current_at", existing_type=sa.DateTime(), nullable=False)
