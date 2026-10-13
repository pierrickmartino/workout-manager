"""Seed the curated Exercises Curated Protocols name (ADR-0130)

Adopting a Curated Protocol only *resolves* Exercises and never creates a Catalog row, so every
movement a Curated Protocol names is seeded as a ``curated`` Exercise from the manifest in
``app.curated.exercises``. The content-integrity test fails the build if a Curated Protocol names
anything outside that manifest. This migration seeds its first batch, ``CURATED_EXERCISES_0046``.

Idempotent, and the downgrade removes only the still-curated seed rows nothing references:
see ``app.curated.seed_migration``.

Revision ID: 0046_seed_curated_exercises
Revises: 0045_protocol_made_current_at
Create Date: 2026-10-12
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

from app.curated.exercises import CURATED_EXERCISES_0046
from app.curated.seed_migration import delete_curated_batch, insert_curated_batch

revision: str = "0046_seed_curated_exercises"
down_revision: str | None = "0045_protocol_made_current_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    insert_curated_batch(op.get_bind(), CURATED_EXERCISES_0046)


def downgrade() -> None:
    delete_curated_batch(op.get_bind(), CURATED_EXERCISES_0046)
