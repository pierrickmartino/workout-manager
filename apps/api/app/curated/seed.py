"""Seed the curated Catalog Exercises through a repository (ADR-0130).

The migration (``0046_seed_curated_protocol_exercises``) inserts the same manifest with raw
SQL, as migrations must not depend on application repositories. This helper is the offline
twin the in-memory test harnesses use, so a test catalog holds exactly what a migrated
database holds. Idempotent by normalized-name dedup (ADR-0002)."""

from __future__ import annotations

from app.curated.exercises import CURATED_EXERCISES
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import ExerciseRepository


def seed_curated_exercises(exercises: ExerciseRepository) -> None:
    """Insert each curated manifest entry not already in the catalog."""

    for item in CURATED_EXERCISES:
        exercises.find_or_create(
            item.name,
            provenance=Provenance.CURATED,
            description=item.description,
            targeted_muscles=item.targeted_muscles,
            required_equipment=item.required_equipment,
            instructions=(item.guidance,),
        )


__all__ = ["seed_curated_exercises"]
