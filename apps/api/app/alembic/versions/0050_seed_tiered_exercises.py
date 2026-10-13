"""Seed the curated Exercises the tiered Curated Protocol adds (ADR-0130, issue #692)

The tiered program's T1 lifts and T3 accessories are already seeded by 0046 and 0049; its four
T2 barbell variations arrive as their own batch, ``CURATED_EXERCISES_0050``. Same idempotent
insert and reference-safe downgrade as 0046 (``app.curated.seed_migration``).

Revision ID: 0050_seed_tiered_exercises
Revises: 0049_seed_push_pull_legs_exercises
Create Date: 2026-10-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.curated.exercises import CURATED_EXERCISES_0050
from app.curated.seed_migration import delete_curated_batch, insert_curated_batch

revision: str = "0050_seed_tiered_exercises"
down_revision: str | None = "0049_seed_push_pull_legs_exercises"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insert_curated_batch(op.get_bind(), CURATED_EXERCISES_0050)


def downgrade() -> None:
    delete_curated_batch(op.get_bind(), CURATED_EXERCISES_0050)
