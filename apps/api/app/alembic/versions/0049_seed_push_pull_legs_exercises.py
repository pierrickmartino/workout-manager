"""Seed the curated Exercises the push/pull/legs Curated Protocol adds (ADR-0130, issue #691)

0046 has already run on an existing database, so the movements push/pull/legs names that 0046
did not seed arrive as their own batch, ``CURATED_EXERCISES_0049``. Same idempotent insert and
reference-safe downgrade as 0046 (``app.curated.seed_migration``).

Revision ID: 0049_seed_push_pull_legs_exercises
Revises: 0048_curated_lineage
Create Date: 2026-10-13
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.curated.exercises import CURATED_EXERCISES_0049
from app.curated.seed_migration import delete_curated_batch, insert_curated_batch

revision: str = "0049_seed_push_pull_legs_exercises"
down_revision: str | None = "0048_curated_lineage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insert_curated_batch(op.get_bind(), CURATED_EXERCISES_0049)


def downgrade() -> None:
    delete_curated_batch(op.get_bind(), CURATED_EXERCISES_0049)
