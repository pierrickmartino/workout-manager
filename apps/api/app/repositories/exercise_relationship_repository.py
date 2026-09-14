"""Repository for typed Variation/Alternative links in the Exercise catalog.

The relationships are directional: each row records that some ``to`` Exercise is a
Variation or Alternative *of* a ``from`` Exercise. Substitution reads them through
``substitutes_for`` to assemble the candidate set it resolves over, lookup-first.
Admin curation reads *both* directions via ``list_for`` and manages links with the
guarded ``add`` / ``remove`` (issue #505, spec §4). A SQLModel-backed implementation
and an in-memory fake honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from sqlmodel import Session, delete, select

from app.db.models import Exercise, ExerciseRelationship
from app.domain.substitution import RelationKind


class RelationDirection(str, Enum):
    """Which way a relationship points *relative to the Exercise being viewed*.

    ``OUTGOING`` — the linked Exercise is a Variation/Alternative *of* this one (this
    Exercise is the ``from`` of the row). ``INCOMING`` — this Exercise is a
    Variation/Alternative *of* the linked one (this Exercise is the ``to`` of the row).
    Substitution only ever reads the outgoing direction; the admin editor surfaces both
    so a curator sees the full local graph before editing it (issue #505)."""

    OUTGOING = "outgoing"
    INCOMING = "incoming"


class SelfLinkError(ValueError):
    """Raised when a link would point an Exercise at itself (``from == to``)."""


class DuplicateRelationshipError(ValueError):
    """Raised when a ``(from, to, kind)`` link already exists."""


@dataclass(frozen=True)
class RelatedExercise:
    """A catalog Exercise linked to another, tagged with the relationship kind."""

    exercise: Exercise
    kind: RelationKind


@dataclass(frozen=True)
class DirectedRelationship:
    """A relationship as seen from one Exercise: the *other* Exercise, the kind, and
    which way the link points relative to the viewed Exercise (issue #505)."""

    exercise: Exercise
    kind: RelationKind
    direction: RelationDirection


class ExerciseRelationshipRepository(Protocol):
    def add(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        """Record that ``to_exercise_id`` is a ``kind`` of ``from_exercise_id``.

        Rejects a self-link (``SelfLinkError``) and a duplicate ``(from, to, kind)``
        (``DuplicateRelationshipError``) so the relationship graph stays clean. No
        reciprocal/inverse link is ever created — a link is exactly one directed row."""
        ...

    def remove(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        """Delete the ``(from, to, kind)`` link. Idempotent: removing an absent link is
        a no-op, and only that one directed row is touched."""
        ...

    def substitutes_for(self, exercise_id: int) -> list[RelatedExercise]:
        """Return the catalog Exercises linked as substitutes for ``exercise_id``,
        each tagged with its relationship kind (outgoing links only).

        A **Retired** linked Exercise is omitted (ADR-0076): this is the discovery-facing
        candidate read behind both Substitution and the Exercise-Detail variation/alternative
        sublist, so a retired movement never surfaces as a candidate. The link itself is left
        intact — un-retiring restores it — and ``list_for`` still shows it to the admin."""
        ...

    def list_for(self, exercise_id: int) -> list[DirectedRelationship]:
        """Return every relationship touching ``exercise_id`` — both directions — each
        carrying the other Exercise, the kind, and the direction (issue #505)."""
        ...


class SqlExerciseRelationshipRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        if from_exercise_id == to_exercise_id:
            raise SelfLinkError(
                "an exercise cannot be a variation/alternative of itself"
            )
        existing = self._session.exec(
            select(ExerciseRelationship).where(
                ExerciseRelationship.from_exercise_id == from_exercise_id,
                ExerciseRelationship.to_exercise_id == to_exercise_id,
                ExerciseRelationship.kind == kind.value,
            )
        ).first()
        if existing is not None:
            raise DuplicateRelationshipError("that relationship already exists")
        self._session.add(
            ExerciseRelationship(
                from_exercise_id=from_exercise_id,
                to_exercise_id=to_exercise_id,
                kind=kind.value,
            )
        )
        self._session.commit()

    def remove(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        self._session.exec(
            delete(ExerciseRelationship).where(
                ExerciseRelationship.from_exercise_id == from_exercise_id,
                ExerciseRelationship.to_exercise_id == to_exercise_id,
                ExerciseRelationship.kind == kind.value,
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
            # A retired candidate is hidden from this discovery read (ADR-0076); the link
            # row stays intact so un-retiring restores the candidate.
            if exercise is not None and not exercise.retired:
                related.append(
                    RelatedExercise(exercise=exercise, kind=RelationKind(row.kind))
                )
        return related

    def list_for(self, exercise_id: int) -> list[DirectedRelationship]:
        outgoing = self._session.exec(
            select(ExerciseRelationship)
            .where(ExerciseRelationship.from_exercise_id == exercise_id)
            .order_by(ExerciseRelationship.id)
        ).all()
        incoming = self._session.exec(
            select(ExerciseRelationship)
            .where(ExerciseRelationship.to_exercise_id == exercise_id)
            .order_by(ExerciseRelationship.id)
        ).all()
        listed: list[DirectedRelationship] = []
        for row in outgoing:
            other = self._session.get(Exercise, row.to_exercise_id)
            if other is not None:
                listed.append(
                    DirectedRelationship(
                        exercise=other,
                        kind=RelationKind(row.kind),
                        direction=RelationDirection.OUTGOING,
                    )
                )
        for row in incoming:
            other = self._session.get(Exercise, row.from_exercise_id)
            if other is not None:
                listed.append(
                    DirectedRelationship(
                        exercise=other,
                        kind=RelationKind(row.kind),
                        direction=RelationDirection.INCOMING,
                    )
                )
        return listed


class InMemoryExerciseRelationshipRepository:
    def __init__(self, exercises) -> None:
        self._exercises = exercises
        self._links: list[ExerciseRelationship] = []

    def add(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        if from_exercise_id == to_exercise_id:
            raise SelfLinkError(
                "an exercise cannot be a variation/alternative of itself"
            )
        if any(
            link.from_exercise_id == from_exercise_id
            and link.to_exercise_id == to_exercise_id
            and link.kind == kind.value
            for link in self._links
        ):
            raise DuplicateRelationshipError("that relationship already exists")
        self._links.append(
            ExerciseRelationship(
                id=len(self._links) + 1,
                from_exercise_id=from_exercise_id,
                to_exercise_id=to_exercise_id,
                kind=kind.value,
            )
        )

    def remove(
        self, from_exercise_id: int, to_exercise_id: int, kind: RelationKind
    ) -> None:
        self._links = [
            link
            for link in self._links
            if not (
                link.from_exercise_id == from_exercise_id
                and link.to_exercise_id == to_exercise_id
                and link.kind == kind.value
            )
        ]

    def substitutes_for(self, exercise_id: int) -> list[RelatedExercise]:
        related: list[RelatedExercise] = []
        for link in self._links:
            if link.from_exercise_id != exercise_id:
                continue
            exercise = self._exercises.get(link.to_exercise_id)
            # A retired candidate is hidden from this discovery read (ADR-0076); the link
            # row stays intact so un-retiring restores the candidate.
            if exercise is not None and not exercise.retired:
                related.append(
                    RelatedExercise(exercise=exercise, kind=RelationKind(link.kind))
                )
        return related

    def list_for(self, exercise_id: int) -> list[DirectedRelationship]:
        listed: list[DirectedRelationship] = []
        for link in self._links:
            if link.from_exercise_id == exercise_id:
                other = self._exercises.get(link.to_exercise_id)
                direction = RelationDirection.OUTGOING
            elif link.to_exercise_id == exercise_id:
                other = self._exercises.get(link.from_exercise_id)
                direction = RelationDirection.INCOMING
            else:
                continue
            if other is not None:
                listed.append(
                    DirectedRelationship(
                        exercise=other,
                        kind=RelationKind(link.kind),
                        direction=direction,
                    )
                )
        return listed


__all__ = [
    "RelatedExercise",
    "DirectedRelationship",
    "RelationDirection",
    "SelfLinkError",
    "DuplicateRelationshipError",
    "ExerciseRelationshipRepository",
    "SqlExerciseRelationshipRepository",
    "InMemoryExerciseRelationshipRepository",
]
