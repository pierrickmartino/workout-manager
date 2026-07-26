"""Seed common cardio/mobility movements as curated Exercises (ADR-0033)

Plan-less logging (ADR-0031) lets a user record an ad-hoc run, walk, or stretch no
AI prescribed. Those movements otherwise never enter the shared catalog — AI
generation only mints Exercises for *prescribed* work — so this migration seeds a
small, fixed set of the most common cardio and mobility movements as ``curated``
entries, each with a coarse Muscle Group roll-up and a single Execution Step of
guidance. This is the first real use of the ``curated`` Provenance.

Idempotent by design: it inserts only the movements whose normalized name is not
already present, so re-running (every ``alembic upgrade head`` on start) never
duplicates a movement and never overwrites a user-created entry that got there
first (ADR-0002 dedup). The downgrade removes only the still-curated seed rows it
would have inserted, leaving any user-superseded entry alone.

Revision ID: 0019_seed_common_movements
Revises: 0018_performed_body_weight
Create Date: 2026-07-26
"""
from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.db.seed_movements import COMMON_MOVEMENTS
from app.domain.exercise import Provenance, normalize_name

revision: str = "0019_seed_common_movements"
down_revision: str | None = "0018_performed_body_weight"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Insert each seed movement not already in the catalog by normalized name."""

    bind = op.get_bind()
    existing = {
        row.normalized_name
        for row in bind.execute(sa.text("SELECT normalized_name FROM exercise"))
    }
    insert = sa.text(
        "INSERT INTO exercise ("
        "normalized_name, name, description, provenance, "
        "targeted_muscles, primary_muscles, secondary_muscles, "
        "required_equipment, instructions, difficulty, precautions"
        ") VALUES ("
        ":normalized_name, :name, NULL, :provenance, "
        ":targeted_muscles, '[]', '[]', '[]', :instructions, NULL, '[]'"
        ")"
    )
    for movement in COMMON_MOVEMENTS:
        key = normalize_name(movement.name)
        if key in existing:
            continue
        bind.execute(
            insert,
            {
                "normalized_name": key,
                "name": movement.name,
                "provenance": Provenance.CURATED.value,
                "targeted_muscles": json.dumps(list(movement.targeted_muscles)),
                "instructions": json.dumps([movement.guidance]),
            },
        )


def downgrade() -> None:
    """Delete the still-curated seed rows this migration inserts.

    Guarded on ``provenance = 'curated'`` so a user-created entry that later took
    over the same normalized name is never removed by the rollback."""

    bind = op.get_bind()
    delete = sa.text(
        "DELETE FROM exercise "
        "WHERE normalized_name = :normalized_name AND provenance = :provenance"
    )
    for movement in COMMON_MOVEMENTS:
        bind.execute(
            delete,
            {
                "normalized_name": normalize_name(movement.name),
                "provenance": Provenance.CURATED.value,
            },
        )
