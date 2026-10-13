"""The raw-SQL seed every curated Exercise migration runs (ADR-0130).

Each batch of the curated manifest (``exercises.py``) is seeded by its own migration. They share
this helper rather than application repositories, which migrations must not depend on.

Idempotent like 0019: only names not already in the catalog (by normalized name, ADR-0002) are
inserted, so an entry generation or a user created first is kept untouched. It is **not**
promoted to ``curated``, because its content was never reviewed. The removal deletes only the
still-curated seed rows that nothing references."""

from __future__ import annotations

import json
from collections.abc import Iterable

import sqlalchemy as sa
from sqlalchemy.engine import Connection

from app.curated.exercises import CuratedExercise
from app.domain.exercise import Provenance, normalize_name

_INSERT = sa.text(
    "INSERT INTO exercise ("
    "normalized_name, name, description, provenance, "
    "targeted_muscles, primary_muscles, secondary_muscles, "
    "required_equipment, instructions, difficulty, precautions"
    ") VALUES ("
    ":normalized_name, :name, :description, :provenance, "
    ":targeted_muscles, '[]', '[]', :required_equipment, :instructions, NULL, '[]'"
    ")"
)

# Only a still-curated row that no plan, record, relationship or image uses, so the rollback
# never breaks a foreign key or removes an entry someone else owns.
_DELETE = sa.text(
    "DELETE FROM exercise "
    "WHERE normalized_name = :normalized_name AND provenance = :provenance "
    "AND NOT EXISTS (SELECT 1 FROM exercise_prescription p "
    "WHERE p.exercise_id = exercise.id) "
    "AND NOT EXISTS (SELECT 1 FROM logged_set s WHERE s.exercise_id = exercise.id) "
    "AND NOT EXISTS (SELECT 1 FROM exercise_relationship r "
    "WHERE r.from_exercise_id = exercise.id OR r.to_exercise_id = exercise.id) "
    "AND NOT EXISTS (SELECT 1 FROM exercise_image i WHERE i.exercise_id = exercise.id)"
)


def insert_curated_batch(bind: Connection, batch: Iterable[CuratedExercise]) -> None:
    """Insert each entry of ``batch`` whose normalized name is not already in the catalog."""

    existing = {
        row.normalized_name
        for row in bind.execute(sa.text("SELECT normalized_name FROM exercise"))
    }
    for item in batch:
        key = normalize_name(item.name)
        if key in existing:
            continue
        bind.execute(
            _INSERT,
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


def delete_curated_batch(bind: Connection, batch: Iterable[CuratedExercise]) -> None:
    """Delete the still-curated, unreferenced rows ``batch`` seeded."""

    for item in batch:
        bind.execute(
            _DELETE,
            {
                "normalized_name": normalize_name(item.name),
                "provenance": Provenance.CURATED.value,
            },
        )


__all__ = ["insert_curated_batch", "delete_curated_batch"]
