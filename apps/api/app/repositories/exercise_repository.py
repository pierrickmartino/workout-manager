"""Repository for the shared Exercise catalog.

The one rule that lives here is ADR-0002 dedup: ``find_or_create`` resolves an
Exercise by its normalized name, returning the existing entry when one is present
and otherwise creating it with the supplied Provenance. Reuse never overwrites an
existing definition — a curated entry is not clobbered by a later AI write. Two
implementations are provided: SQLModel-backed for production and an in-memory fake
for tests; the same contract runs over both."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import Exercise
from app.domain.exercise import Provenance, normalize_name


class ExerciseRepository(Protocol):
    def find_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: str | None = None,
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
    ) -> Exercise:
        """Return the catalog Exercise for ``name``'s normalized form, creating it
        with ``provenance`` and the given details if it does not yet exist."""
        ...

    def get(self, exercise_id: int) -> Exercise | None:
        """Return the catalog Exercise with ``exercise_id``, or ``None``."""
        ...


def _new_exercise(
    name: str,
    provenance: Provenance,
    description: str | None,
    targeted_muscles: Sequence[str],
    required_equipment: Sequence[str],
    instructions: str | None,
    difficulty: int | None,
    precautions: Sequence[str],
) -> Exercise:
    return Exercise(
        name=name,
        normalized_name=normalize_name(name),
        provenance=provenance.value,
        description=description,
        targeted_muscles=list(targeted_muscles),
        required_equipment=list(required_equipment),
        instructions=instructions,
        difficulty=difficulty,
        precautions=list(precautions),
    )


class SqlExerciseRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def find_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: str | None = None,
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
    ) -> Exercise:
        key = normalize_name(name)
        existing = self._lookup(key)
        if existing is not None:
            return existing

        exercise = _new_exercise(
            name,
            provenance,
            description,
            targeted_muscles,
            required_equipment,
            instructions,
            difficulty,
            precautions,
        )
        self._session.add(exercise)
        try:
            self._session.commit()
        except IntegrityError:
            # A concurrent request inserted the same normalized_name between our
            # lookup and commit, colliding on the unique index. Roll back our
            # losing insert and return the row the winner created — find_or_create
            # stays idempotent under concurrency (ADR-0002 dedup).
            self._session.rollback()
            winner = self._lookup(key)
            if winner is None:  # a different integrity violation; surface it
                raise
            return winner
        self._session.refresh(exercise)
        return exercise

    def _lookup(self, normalized_name: str) -> Exercise | None:
        return self._session.exec(
            select(Exercise).where(Exercise.normalized_name == normalized_name)
        ).first()

    def get(self, exercise_id: int) -> Exercise | None:
        return self._session.get(Exercise, exercise_id)


class InMemoryExerciseRepository:
    def __init__(self) -> None:
        self._by_key: dict[str, Exercise] = {}
        self._by_id: dict[int, Exercise] = {}
        self._next_id = 1

    def find_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: str | None = None,
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
    ) -> Exercise:
        key = normalize_name(name)
        existing = self._by_key.get(key)
        if existing is not None:
            return existing

        exercise = _new_exercise(
            name,
            provenance,
            description,
            targeted_muscles,
            required_equipment,
            instructions,
            difficulty,
            precautions,
        )
        exercise.id = self._next_id
        self._next_id += 1
        self._by_key[key] = exercise
        self._by_id[exercise.id] = exercise
        return exercise

    def get(self, exercise_id: int) -> Exercise | None:
        return self._by_id.get(exercise_id)


__all__ = [
    "ExerciseRepository",
    "SqlExerciseRepository",
    "InMemoryExerciseRepository",
]
