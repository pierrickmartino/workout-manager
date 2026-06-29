"""Repository for typed Variation/Alternative links in the Exercise catalog.

The relationships are directional: each row records that some ``to`` Exercise is a
Variation or Alternative *of* a ``from`` Exercise. Substitution reads them through
``substitutes_for`` to assemble the candidate set it resolves over, lookup-first.
A SQLModel-backed implementation and an in-memory fake honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Exercise, ExerciseRelationship
from app.domain.substitution import RelationKind


@dataclass(frozen=True)
class RelatedExercise:
    """A catalog Exercise linked to another, tagged with the relationship kind."""

    exercise: Exercise
    kind: RelationKind


class ExerciseRelationshipRepository(Protocol):
    def add(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        """Record that ``to_exercise_id`` is a ``kind`` of ``from_exercise_id``."""
        ...

    def substitutes_for(self, exercise_id: int) -> list[RelatedExercise]:
        """Return the catalog Exercises linked as substitutes for ``exercise_id``,
        each tagged with its relationship kind."""
        ...


class SqlExerciseRelationshipRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        self._session.add(
            ExerciseRelationship(
                from_exercise_id=from_exercise_id,
                to_exercise_id=to_exercise_id,
                kind=kind.value,
            )
        )
        self._session.commit()

    def substitutes_for(self, exercise_id: int) -> list[RelatedExercise]:
        rows = self._session.exec(
            select(ExerciseRelationship)
            .where(ExerciseRelationship.from_exercise_id == exercise_id)
            .order_by(ExerciseRelationship.id)
        ).all()
        related: list[RelatedExercise] = []
        for row in rows:
            exercise = self._session.get(Exercise, row.to_exercise_id)
            if exercise is not None:
                related.append(
                    RelatedExercise(exercise=exercise, kind=RelationKind(row.kind))
                )
        return related


class InMemoryExerciseRelationshipRepository:
    def __init__(self, exercises) -> None:
        self._exercises = exercises
        self._links: list[ExerciseRelationship] = []

    def add(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        self._links.append(
            ExerciseRelationship(
                id=len(self._links) + 1,
                from_exercise_id=from_exercise_id,
                to_exercise_id=to_exercise_id,
                kind=kind.value,
            )
        )

    def substitutes_for(self, exercise_id: int) -> list[RelatedExercise]:
        related: list[RelatedExercise] = []
        for link in self._links:
            if link.from_exercise_id != exercise_id:
                continue
            exercise = self._exercises.get(link.to_exercise_id)
            if exercise is not None:
                related.append(
                    RelatedExercise(exercise=exercise, kind=RelationKind(link.kind))
                )
        return related


__all__ = [
    "RelatedExercise",
    "ExerciseRelationshipRepository",
    "SqlExerciseRelationshipRepository",
    "InMemoryExerciseRelationshipRepository",
]
