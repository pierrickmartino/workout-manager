"""Repository for the shared Exercise catalog.

The one rule that lives here is ADR-0002 dedup: ``find_or_create`` resolves an
Exercise by its normalized name, returning the existing entry when one is present
and otherwise creating it with the supplied Provenance. Reuse never overwrites an
existing definition — a curated entry is not clobbered by a later AI write. Two
implementations are provided: SQLModel-backed for production and an in-memory fake
for tests; the same contract runs over both."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.db.models import Exercise
from app.domain.exercise import Provenance, normalize_name, rank_exercise_matches


@dataclass(frozen=True)
class ResolvedExercise:
    """The outcome of a resolve-or-create: the catalog Exercise and whether it was
    freshly minted this call.

    ``created`` is the async-enrichment trigger (issue #309, ADR-0041): only a
    genuine normalized-name miss mints a new Stub, and only that case should enqueue
    an Enrichment job — a dedup hit (``created`` is ``False``) enqueues nothing and
    leaves the existing entry's Provenance untouched (ADR-0002). The losing side of
    a concurrent insert also reports ``created`` ``False``: the winner minted the
    row (and enqueued its job), so the loser must not re-enqueue."""

    exercise: Exercise
    created: bool


@dataclass(frozen=True)
class ExerciseSearchPage:
    """One page of Exercise Library results plus the full match count.

    ``items`` is the ranked, limit/offset-sliced slice the caller shows;
    ``total`` is how many catalog Exercises matched the query in all, so the route
    can report pagination meta (ADR-0021: the library is a read over the shared
    catalog — it never creates)."""

    items: list[Exercise]
    total: int


class ExerciseRepository(Protocol):
    def resolve_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        primary_muscles: Sequence[str] = (),
        secondary_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: Sequence[str] = (),
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
        image: str | None = None,
    ) -> ResolvedExercise:
        """Resolve ``name`` to a catalog Exercise, reporting whether it was created.

        Same normalized-name dedup as ``find_or_create`` (ADR-0002), but returns a
        ``ResolvedExercise`` whose ``created`` flag distinguishes a genuine miss (a
        new Stub was minted) from a dedup hit (an existing entry was returned
        untouched). The async-on-create Enrichment trigger (issue #309) enqueues only
        when ``created`` is ``True``."""
        ...

    def find_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        primary_muscles: Sequence[str] = (),
        secondary_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: Sequence[str] = (),
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
        image: str | None = None,
    ) -> Exercise:
        """Return the catalog Exercise for ``name``'s normalized form, creating it
        with ``provenance`` and the given details if it does not yet exist.

        A convenience wrapper over ``resolve_or_create`` for the many callers that do
        not need to know whether the row was freshly minted."""
        ...

    def get(self, exercise_id: int) -> Exercise | None:
        """Return the catalog Exercise with ``exercise_id``, or ``None``."""
        ...

    def search(
        self, query: str, *, limit: int, offset: int
    ) -> ExerciseSearchPage:
        """Return the catalog Exercises whose normalized name contains ``query``.

        The query is normalized the same way names are (ADR-0002), so matching is
        case- and whitespace-insensitive; a blank query matches nothing. Results
        are ranked curated-first then by name and sliced by ``limit``/``offset``.
        Read-only — the Exercise Library never creates a catalog entry (ADR-0021)."""
        ...

    def list_by_provenance(self, provenance: Provenance) -> list[Exercise]:
        """Return every catalog Exercise carrying ``provenance``.

        The re-enrichment pass (issue #107) reads the ``ai_generated`` rows through
        this so it can scope its AI batch to invented movements and never touch
        curated content (ADR-0016)."""
        ...

    def list_all(self) -> list[Exercise]:
        """Return every catalog Exercise, regardless of Provenance.

        The Stub-enrichment backfill (issue #308) walks the whole catalog through
        this and classifies each row with the **provenance-blind** Catalog
        Completeness projection (ADR-0041), so a sub-bar ``curated`` seed is lifted
        alongside a ``user_entered`` or ``ai_generated`` Stub."""
        ...

    def set_enrichment(
        self,
        exercise_id: int,
        *,
        description: str | None,
        targeted_muscles: Sequence[str],
        instructions: Sequence[str],
        difficulty: int | None,
    ) -> Exercise | None:
        """Write the enrichable field set (ADR-0041) on one Exercise.

        Updates *only* ``description`` / ``targeted_muscles`` / ``instructions`` /
        ``difficulty`` — the fields that lift a Stub to Listable. Provenance,
        precautions, the Exercise Image, and the Primary/Secondary split are left
        untouched: enrichment never promotes trust and never writes curator-only or
        Enriched-tier content. Returns the updated Exercise, or ``None`` if no row
        has ``exercise_id``."""
        ...

    def set_muscle_emphasis(
        self,
        exercise_id: int,
        *,
        primary_muscles: Sequence[str],
        secondary_muscles: Sequence[str],
    ) -> Exercise | None:
        """Write the Primary/Secondary emphasis split (ADR-0016) on one Exercise.

        Updates *only* ``primary_muscles`` / ``secondary_muscles`` — the durable
        ``targeted_muscles`` union the F3 roll-up reads is left untouched — and
        returns the updated Exercise, or ``None`` if no row has ``exercise_id``."""
        ...


def _new_exercise(
    name: str,
    provenance: Provenance,
    description: str | None,
    targeted_muscles: Sequence[str],
    primary_muscles: Sequence[str],
    secondary_muscles: Sequence[str],
    required_equipment: Sequence[str],
    instructions: Sequence[str],
    difficulty: int | None,
    precautions: Sequence[str],
    image: str | None,
) -> Exercise:
    return Exercise(
        name=name,
        normalized_name=normalize_name(name),
        provenance=provenance.value,
        description=description,
        targeted_muscles=list(targeted_muscles),
        primary_muscles=list(primary_muscles),
        secondary_muscles=list(secondary_muscles),
        required_equipment=list(required_equipment),
        instructions=list(instructions),
        difficulty=difficulty,
        precautions=list(precautions),
        image=image,
    )


def _page(matches: list[Exercise], limit: int, offset: int) -> ExerciseSearchPage:
    """Rank the matched Exercises and slice out the requested page.

    Ranking and pagination live here so the SQL and in-memory repositories share
    one ordering (the pure ``rank_exercise_matches``) and one slice rule, and never
    drift. ``total`` is the full match count before the slice."""

    ranked = rank_exercise_matches(matches)
    return ExerciseSearchPage(items=ranked[offset : offset + limit], total=len(ranked))


class SqlExerciseRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def resolve_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        primary_muscles: Sequence[str] = (),
        secondary_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: Sequence[str] = (),
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
        image: str | None = None,
    ) -> ResolvedExercise:
        key = normalize_name(name)
        existing = self._lookup(key)
        if existing is not None:
            return ResolvedExercise(exercise=existing, created=False)

        exercise = _new_exercise(
            name,
            provenance,
            description,
            targeted_muscles,
            primary_muscles,
            secondary_muscles,
            required_equipment,
            instructions,
            difficulty,
            precautions,
            image,
        )
        self._session.add(exercise)
        try:
            self._session.commit()
        except IntegrityError:
            # A concurrent request inserted the same normalized_name between our
            # lookup and commit, colliding on the unique index. Roll back our
            # losing insert and return the row the winner created — resolve stays
            # idempotent under concurrency (ADR-0002 dedup). The winner minted the
            # row (and enqueued its Enrichment job), so the loser reports created
            # False and never re-enqueues (issue #309).
            self._session.rollback()
            winner = self._lookup(key)
            if winner is None:  # a different integrity violation; surface it
                raise
            return ResolvedExercise(exercise=winner, created=False)
        self._session.refresh(exercise)
        return ResolvedExercise(exercise=exercise, created=True)

    def find_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        primary_muscles: Sequence[str] = (),
        secondary_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: Sequence[str] = (),
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
        image: str | None = None,
    ) -> Exercise:
        return self.resolve_or_create(
            name,
            provenance=provenance,
            description=description,
            targeted_muscles=targeted_muscles,
            primary_muscles=primary_muscles,
            secondary_muscles=secondary_muscles,
            required_equipment=required_equipment,
            instructions=instructions,
            difficulty=difficulty,
            precautions=precautions,
            image=image,
        ).exercise

    def _lookup(self, normalized_name: str) -> Exercise | None:
        return self._session.exec(
            select(Exercise).where(Exercise.normalized_name == normalized_name)
        ).first()

    def get(self, exercise_id: int) -> Exercise | None:
        return self._session.get(Exercise, exercise_id)

    def search(
        self, query: str, *, limit: int, offset: int
    ) -> ExerciseSearchPage:
        normalized = normalize_name(query)
        if not normalized:
            return ExerciseSearchPage(items=[], total=0)
        matches = list(
            self._session.exec(
                select(Exercise).where(
                    Exercise.normalized_name.contains(normalized)
                )
            ).all()
        )
        return _page(matches, limit, offset)

    def list_by_provenance(self, provenance: Provenance) -> list[Exercise]:
        return list(
            self._session.exec(
                select(Exercise).where(Exercise.provenance == provenance.value)
            ).all()
        )

    def list_all(self) -> list[Exercise]:
        return list(self._session.exec(select(Exercise)).all())

    def set_enrichment(
        self,
        exercise_id: int,
        *,
        description: str | None,
        targeted_muscles: Sequence[str],
        instructions: Sequence[str],
        difficulty: int | None,
    ) -> Exercise | None:
        exercise = self._session.get(Exercise, exercise_id)
        if exercise is None:
            return None
        exercise.description = description
        exercise.targeted_muscles = list(targeted_muscles)
        exercise.instructions = list(instructions)
        exercise.difficulty = difficulty
        self._session.add(exercise)
        self._session.commit()
        self._session.refresh(exercise)
        return exercise

    def set_muscle_emphasis(
        self,
        exercise_id: int,
        *,
        primary_muscles: Sequence[str],
        secondary_muscles: Sequence[str],
    ) -> Exercise | None:
        exercise = self._session.get(Exercise, exercise_id)
        if exercise is None:
            return None
        exercise.primary_muscles = list(primary_muscles)
        exercise.secondary_muscles = list(secondary_muscles)
        self._session.add(exercise)
        self._session.commit()
        self._session.refresh(exercise)
        return exercise


class InMemoryExerciseRepository:
    def __init__(self) -> None:
        self._by_key: dict[str, Exercise] = {}
        self._by_id: dict[int, Exercise] = {}
        self._next_id = 1

    def resolve_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        primary_muscles: Sequence[str] = (),
        secondary_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: Sequence[str] = (),
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
        image: str | None = None,
    ) -> ResolvedExercise:
        key = normalize_name(name)
        existing = self._by_key.get(key)
        if existing is not None:
            return ResolvedExercise(exercise=existing, created=False)

        exercise = _new_exercise(
            name,
            provenance,
            description,
            targeted_muscles,
            primary_muscles,
            secondary_muscles,
            required_equipment,
            instructions,
            difficulty,
            precautions,
            image,
        )
        exercise.id = self._next_id
        self._next_id += 1
        self._by_key[key] = exercise
        self._by_id[exercise.id] = exercise
        return ResolvedExercise(exercise=exercise, created=True)

    def find_or_create(
        self,
        name: str,
        *,
        provenance: Provenance,
        description: str | None = None,
        targeted_muscles: Sequence[str] = (),
        primary_muscles: Sequence[str] = (),
        secondary_muscles: Sequence[str] = (),
        required_equipment: Sequence[str] = (),
        instructions: Sequence[str] = (),
        difficulty: int | None = None,
        precautions: Sequence[str] = (),
        image: str | None = None,
    ) -> Exercise:
        return self.resolve_or_create(
            name,
            provenance=provenance,
            description=description,
            targeted_muscles=targeted_muscles,
            primary_muscles=primary_muscles,
            secondary_muscles=secondary_muscles,
            required_equipment=required_equipment,
            instructions=instructions,
            difficulty=difficulty,
            precautions=precautions,
            image=image,
        ).exercise

    def get(self, exercise_id: int) -> Exercise | None:
        return self._by_id.get(exercise_id)

    def search(
        self, query: str, *, limit: int, offset: int
    ) -> ExerciseSearchPage:
        normalized = normalize_name(query)
        if not normalized:
            return ExerciseSearchPage(items=[], total=0)
        matches = [
            exercise
            for exercise in self._by_id.values()
            if normalized in exercise.normalized_name
        ]
        return _page(matches, limit, offset)

    def list_by_provenance(self, provenance: Provenance) -> list[Exercise]:
        return [
            exercise
            for exercise in self._by_id.values()
            if exercise.provenance == provenance.value
        ]

    def list_all(self) -> list[Exercise]:
        return list(self._by_id.values())

    def set_enrichment(
        self,
        exercise_id: int,
        *,
        description: str | None,
        targeted_muscles: Sequence[str],
        instructions: Sequence[str],
        difficulty: int | None,
    ) -> Exercise | None:
        exercise = self._by_id.get(exercise_id)
        if exercise is None:
            return None
        exercise.description = description
        exercise.targeted_muscles = list(targeted_muscles)
        exercise.instructions = list(instructions)
        exercise.difficulty = difficulty
        return exercise

    def set_muscle_emphasis(
        self,
        exercise_id: int,
        *,
        primary_muscles: Sequence[str],
        secondary_muscles: Sequence[str],
    ) -> Exercise | None:
        exercise = self._by_id.get(exercise_id)
        if exercise is None:
            return None
        exercise.primary_muscles = list(primary_muscles)
        exercise.secondary_muscles = list(secondary_muscles)
        return exercise


__all__ = [
    "ExerciseRepository",
    "ExerciseSearchPage",
    "ResolvedExercise",
    "SqlExerciseRepository",
    "InMemoryExerciseRepository",
]
