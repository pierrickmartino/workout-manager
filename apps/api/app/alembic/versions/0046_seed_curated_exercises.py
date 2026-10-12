"""Seed the curated Exercises Curated Protocols name (ADR-0130)

Adopting a Curated Protocol only *resolves* Exercises and never creates a Catalog row, so every
movement a Curated Protocol names is seeded here as a ``curated`` Exercise from the manifest in
``app.curated.exercises``. The content-integrity test fails the build if a program names
anything outside that manifest.

Idempotent like 0019: only names not already in the catalog (by normalized name, ADR-0002) are
inserted, so an entry generation or a user created first is kept untouched. It is **not**
promoted to ``curated``, because its content was never reviewed. The downgrade removes only the
still-curated seed rows that nothing references.

Revision ID: 0046_seed_curated_exercises
Revises: 0045_protocol_made_current_at
Create Date: 2026-10-12
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.curated.exercises import CURATED_EXERCISES
from app.domain.exercise import Provenance, normalize_name

revision: str = "0046_seed_curated_exercises"
down_revision: str | None = "0045_protocol_made_current_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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
        ":normalized_name, :name, :description, :provenance, "
        ":targeted_muscles, '[]', '[]', :required_equipment, :instructions, NULL, '[]'"
        ")"
    )
    for item in CURATED_EXERCISES:
        key = normalize_name(item.name)
        if key in existing:
            continue
        bind.execute(
            insert,
            {
                "normalized_name": key,
                "name": item.name,
                "description": item.description,
                "provenance": Provenance.CURATED.value,
                "targeted_muscles": json.dumps(list(item.targeted_muscles)),
                "required_equipment": json.dumps(list(item.required_equipment)),
                "instructions": json.dumps([item.guidance]),
            },
        )


def downgrade() -> None:
    """Delete the still-curated seed rows that no plan, record, relationship or image uses,
    so the rollback never breaks a foreign key or removes an entry someone else owns."""

    bind = op.get_bind()
    delete = sa.text(
        "DELETE FROM exercise "
        "WHERE normalized_name = :normalized_name AND provenance = :provenance "
        "AND NOT EXISTS (SELECT 1 FROM exercise_prescription p "
        "WHERE p.exercise_id = exercise.id) "
        "AND NOT EXISTS (SELECT 1 FROM logged_set s WHERE s.exercise_id = exercise.id) "
        "AND NOT EXISTS (SELECT 1 FROM exercise_relationship r "
        "WHERE r.from_exercise_id = exercise.id OR r.to_exercise_id = exercise.id) "
        "AND NOT EXISTS (SELECT 1 FROM exercise_image i WHERE i.exercise_id = exercise.id)"
    )
    for item in CURATED_EXERCISES:
        bind.execute(
            delete,
            {
                "normalized_name": normalize_name(item.name),
                "provenance": Provenance.CURATED.value,
            },
        )
