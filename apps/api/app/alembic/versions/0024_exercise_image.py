"""A catalog Exercise gains an optional Exercise Image (ADR-0041)

Adds a nullable ``image`` column to ``exercise`` — a single curated-source
illustration reference (a URL / asset key) shown on Exercise Detail. The column
is nullable with no server default, so every existing catalog row keeps no image
and stays fully usable: the picture is part of the Enriched (gold) tier and its
absence never holds a movement below the Listable bar. Curated-source only and
never AI-fabricated — a misleading generated picture is a safety hazard in an
injury/rehab-cautious domain.

The downgrade drops the column, leaving the rest of the catalog untouched.

Revision ID: 0024_exercise_image
Revises: 0023_session_provenance
Create Date: 2026-08-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0024_exercise_image"
down_revision: str | None = "0023_session_provenance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("exercise") as batch:
        batch.add_column(
            sa.Column("image", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("exercise") as batch:
        batch.drop_column("image")
