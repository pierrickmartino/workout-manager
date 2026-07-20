"""add Performed Body Weight column to the Logged Set (issue #196, ADR-0026)

Gives ``logged_set`` a nullable ``body_weight_kg`` column — the Performed Body Weight
(ADR-0026): the performer's body mass snapshotted onto each set at the write boundary,
so a bodyweight set's later strength estimate is fixed by what actually happened and
never drifts when the user's current weight changes. Additive and nullable by design:
every existing set reads unchanged, and there is deliberately no backfill — a set
logged before this stays NULL and outside strength records rather than being resolved
against a guessed mass.

Revision ID: 0018_performed_body_weight
Revises: 0017_supersets
Create Date: 2026-07-20
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_performed_body_weight"
down_revision: str | None = "0017_supersets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "logged_set",
        sa.Column("body_weight_kg", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("logged_set", "body_weight_kg")
