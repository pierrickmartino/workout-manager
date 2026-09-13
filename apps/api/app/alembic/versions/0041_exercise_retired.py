"""a catalog Exercise gains a Retire tombstone flag (ADR-0076)

Adds a ``retired`` boolean to ``exercise`` — the reversible soft tombstone an admin
sets to hide a junk, duplicate, or unsafe movement from every discovery / candidate
surface while it stays fully resolvable by id, so nothing that already references it
breaks (ADR-0076). The column is NOT NULL with a ``false`` server default, so every
existing catalog row backfills to active: a movement is discoverable until an admin
retires it, never by accident of the migration.

The admin catalog browser (issue #501) is the first reader — an ops view that shows
retired Exercises so a curator can find and un-retire them; retirement itself, its
enforcement across the discovery reads, and un-retire land with the write endpoints.

The downgrade drops the column, leaving the rest of the catalog untouched.

Revision ID: 0041_exercise_retired
Revises: 0040_note
Create Date: 2026-09-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0041_exercise_retired"
down_revision: str | None = "0040_note"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise"


def upgrade() -> None:
    # NOT NULL with a false server default so every existing row backfills to active
    # without a data step — a movement is discoverable until an admin retires it.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(
            sa.Column(
                "retired",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("retired")
