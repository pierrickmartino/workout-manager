"""Exercise muscles gain a Primary/Secondary emphasis split (ADR-0016)

Adds ``primary_muscles`` and ``secondary_muscles`` JSON columns to ``exercise`` as
an emphasis annotation layered on top of the existing flat ``targeted_muscles``
union. Both default to an empty list, so every existing row keeps its
``targeted_muscles`` untouched and asserts **no** primacy — ADR-0016 forbids
backfilling a guessed split ("all primary" is a false claim, not a null one).
Primacy is populated only where enrichment or a curator actually asserts it.

The downgrade drops the two columns, leaving the durable ``targeted_muscles`` union
the F3 Muscle Group roll-up reads exactly as it was.

Revision ID: 0014_muscle_emphasis_split
Revises: 0013_execution_steps
Create Date: 2026-07-07
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_muscle_emphasis_split"
down_revision: str | None = "0013_execution_steps"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("exercise") as batch:
        batch.add_column(
            sa.Column(
                "primary_muscles",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            )
        )
        batch.add_column(
            sa.Column(
                "secondary_muscles",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'[]'"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("exercise") as batch:
        batch.drop_column("secondary_muscles")
        batch.drop_column("primary_muscles")
