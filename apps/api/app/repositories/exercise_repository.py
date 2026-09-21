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
from typing import Final, Protocol

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from sqlmodel.sql.expression import SelectOfScalar

from app.db.models import (
    Exercise,
    ExercisePrescription,
    ExerciseRelationship,
    LoggedSet,
)
from app.domain.exercise import Provenance, normalize_name, rank_exercise_matches
from app.domain.exercise_admin import AdminBrowseFilters, filter_admin_catalog
from app.domain.exercise_browse import (
    DifficultyBand,
    matches_filters,
    normalize_equipment,
    rank_browse_results,
)
from app.domain.muscle_groups import MuscleGroup


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


class _Unset:
    """Sentinel for a patch field that was **not supplied**.

    A partial edit (``PATCH``) carries only the fields the admin changed, so the writer
    must tell "leave this field alone" apart from "set this field to ``None``" — a
    distinction a bare ``None`` default cannot make for the nullable ``description`` and
    ``difficulty`` columns. Every ``ExercisePatch`` field defaults to this singleton;
    ``_apply_patch`` copies the existing value wherever it is still present."""

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return "UNSET"


UNSET: Final = _Unset()


@dataclass(frozen=True)
class ExercisePatch:
    """A partial edit of one catalog Exercise's descriptive fields (issue #502).

    Only the fields an admin actually changed are supplied; every other field keeps the
    sentinel ``UNSET`` and is left untouched by ``update``. The patch spans exactly the
    descriptive set and the Primary/Secondary emphasis split — never Provenance,
    precautions, the Image, or the retired tombstone, each of which is a separate
    deliberate act with its own endpoint (spec §5). Frozen: a patch is a value, and the
    writer never mutates it."""

    name: str | _Unset = UNSET
    description: str | None | _Unset = UNSET
    targeted_muscles: Sequence[str] | _Unset = UNSET
    primary_muscles: Sequence[str] | _Unset = UNSET
    secondary_muscles: Sequence[str] | _Unset = UNSET
    required_equipment: Sequence[str] | _Unset = UNSET
    instructions: Sequence[str] | _Unset = UNSET
    difficulty: int | None | _Unset = UNSET


class NameCollision(Exception):
    """A rename would collide with a **different** Exercise's normalized name (ADR-0002).

    Identity is by normalized name, so renaming one movement onto the normalized name of
    another would silently merge two distinct movements. The writer refuses and raises
    this instead, changing nothing; the route maps it to ``409``. A same-row rename that
    keeps the normalized identity (a spelling/casing fix) is *not* a collision."""

    def __init__(self, normalized_name: str) -> None:
        super().__init__(f"another exercise already uses the name {normalized_name!r}")
        self.normalized_name = normalized_name


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
        self, query: str, *, limit: int, offset: int, include_retired: bool = False
    ) -> ExerciseSearchPage:
        """Return the catalog Exercises whose normalized name contains ``query``.

        The query is normalized the same way names are (ADR-0002), so matching is
        case- and whitespace-insensitive; a blank query matches nothing. Results
        are ranked curated-first then by name and sliced by ``limit``/``offset``.
        Read-only — the Exercise Library never creates a catalog entry (ADR-0021).
        Retired Exercises are hidden from this discovery read unless ``include_retired``
        is set (ADR-0076); discovery callers pass the default, admin readouts pass ``True``.
        """
        ...

    def browse(
        self,
        *,
        query: str,
        muscle_groups: Sequence[MuscleGroup],
        equipment: Sequence[str],
        difficulty_bands: Sequence[DifficultyBand],
        limit: int,
        offset: int,
        include_retired: bool = False,
    ) -> ExerciseSearchPage:
        """List the whole Catalog for the Browse surface, filtered and paged (ADR-0042).

        A **blank** ``query`` lists the whole Catalog; a non-blank one substring-matches
        by normalized name. The result is then narrowed by the three facets — curated
        Muscle Group, required equipment, and difficulty band (all AND'd, OR within each)
        — ranked curated → completeness → name, and sliced by ``limit``/``offset`` with
        the full filtered count in ``total``. Read-only: browse never creates a catalog
        entry. Retired Exercises are hidden unless ``include_retired`` is set (ADR-0076).
        """
        ...

    def browse_all(
        self,
        *,
        query: str,
        muscle_groups: Sequence[MuscleGroup],
        equipment: Sequence[str],
        difficulty_bands: Sequence[DifficultyBand],
        include_retired: bool = False,
    ) -> list[Exercise]:
        """The whole filtered, ranked Catalog for the field-guide taxonomy (ADR-0072).

        Same query + facet narrowing and same curated → completeness → name ordering as
        ``browse``, but **unpaged**: every matching Exercise is returned so the route can
        group them by Movement Pattern with accurate per-pattern counts. The taxonomy needs
        the whole filtered set to group it, so it does not paginate; the catalog is a
        bounded shared set. Read-only. Retired Exercises are hidden unless ``include_retired``
        is set (ADR-0076)."""
        ...

    def admin_browse(
        self, *, filters: AdminBrowseFilters, limit: int, offset: int
    ) -> ExerciseSearchPage:
        """The operator-only admin catalog-browser feed (issue #501, ADR-0076).

        Spans the **whole** shared Catalog — every Provenance, every Completeness tier
        (Stubs included), and both retired and active rows, unlike the user-facing,
        Listable-only library — narrowed by the composable ``AdminBrowseFilters`` (name
        search, Provenance, computed Completeness tier, retired/active) and sliced by
        ``limit``/``offset`` with the full filtered count in ``total``. Ordered A→Z by
        normalized name for a stable, paginable ops list. Read-only."""
        ...

    def list_by_provenance(
        self, provenance: Provenance, *, include_retired: bool = False
    ) -> list[Exercise]:
        """Return every catalog Exercise carrying ``provenance``.

        The re-enrichment pass (issue #107) reads the ``ai_generated`` rows through
        this so it can scope its AI batch to invented movements and never touch
        curated content (ADR-0016). Retired Exercises are excluded from the enrichment
        scan (no LLM spend on a hidden movement, ADR-0076); an admin readout passes
        ``include_retired=True`` to span them."""
        ...

    def list_all(self, *, include_retired: bool = False) -> list[Exercise]:
        """Return every catalog Exercise, regardless of Provenance.

        The Stub-enrichment backfill (issue #308) walks the whole catalog through
        this and classifies each row with the **provenance-blind** Catalog
        Completeness projection (ADR-0041), so a sub-bar ``curated`` seed is lifted
        alongside a ``user_entered`` or ``ai_generated`` Stub. Retired Exercises are
        hidden from the enrichment scan and the equipment facets by default; an admin
        catalog-health readout passes ``include_retired=True`` (ADR-0076)."""
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
        Enriched-tier content. **Immutable**: returns a fresh Exercise and never mutates the
        row the caller already holds. Returns ``None`` if no row has ``exercise_id``."""
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
        ``targeted_muscles`` union the F3 roll-up reads is left untouched. **Immutable**:
        returns a fresh Exercise and never mutates the caller's row, or ``None`` if no row has
        ``exercise_id``."""
        ...

    def set_provenance(
        self, exercise_id: int, provenance: Provenance
    ) -> Exercise | None:
        """Deliberately set one Exercise's Provenance tier (issue #503, ADR-0075).

        The **only** path that mutates Provenance: an admin promoting, correcting, or
        demoting trust. Writes *only* ``provenance`` — the descriptive set, precautions, the
        Image, and the retired tombstone are all left untouched — and the audit of the change
        is the caller's (route's) responsibility, not this writer's. **Immutable**: returns a
        fresh Exercise and never mutates the row the caller already holds. Returns ``None`` if
        no row has ``exercise_id``. No automated path (enrichment, generation, substitution)
        calls this; those never touch Provenance (ADR-0002/0075)."""
        ...

    def set_precautions(
        self, exercise_id: int, precautions: Sequence[str]
    ) -> Exercise | None:
        """Write one Exercise's curator-only precautions (issue #503, spec §5).

        Writes *only* ``precautions`` — every other field, Provenance included, is left
        untouched — replacing the list wholesale (an empty list clears it). The values are
        HTML-escaped at the route boundary before they reach here (ADR-0036). **Immutable**:
        returns a fresh Exercise and never mutates the caller's row. Returns ``None`` if no
        row has ``exercise_id``."""
        ...

    def update(self, exercise_id: int, patch: ExercisePatch) -> Exercise | None:
        """Partially edit one Exercise's descriptive fields + emphasis split (issue #502).

        Writes only the fields the ``patch`` supplies (the rest keep ``UNSET`` and are
        preserved), spanning the descriptive set and the Primary/Secondary split but never
        Provenance, precautions, the Image, or the retired tombstone (spec §5). A supplied
        ``name`` recomputes ``normalized_name``; if that lands on a **different** row's
        normalized name the write is refused with ``NameCollision`` and nothing changes
        (ADR-0002), while a same-row spelling/casing fix is accepted. **Immutable**:
        returns a fresh Exercise and never mutates the row the caller already holds.
        Returns ``None`` if no row has ``exercise_id``."""
        ...

    def retire(self, exercise_id: int) -> Exercise | None:
        """Set one Exercise's Catalog Retire tombstone (ADR-0076).

        Flips ``retired`` to ``True`` and writes *only* that field — the descriptive set,
        Provenance, precautions, and the Image are all left untouched. A Retired Exercise is
        hidden from every discovery / candidate surface but stays fully resolvable by id, so
        nothing that references it breaks. Only an admin path reaches this; retirement is never
        a side effect of generation, substitution, or enrichment. **Immutable**: returns a
        fresh Exercise and never mutates the caller's row. Returns ``None`` if no row has
        ``exercise_id``. Retiring an already-retired row is an idempotent no-op change.
        """
        ...

    def unretire(self, exercise_id: int) -> Exercise | None:
        """Clear one Exercise's Catalog Retire tombstone for a clean restore (ADR-0076).

        Flips ``retired`` to ``False`` and writes *only* that field, fully restoring the
        Exercise to every discovery surface. Only an admin un-retires — un-retire is never an
        automated resurrection (ADR-0076), so the AI re-inventing a junk name cannot undo a
        curator's decision. **Immutable**: returns a fresh Exercise and never mutates the
        caller's row. Returns ``None`` if no row has ``exercise_id``."""
        ...

    def reference_count(self, exercise_id: int) -> int:
        """Count everything that points at ``exercise_id`` — the hard-delete guard's input.

        Sums the Exercise Prescriptions, Logged Sets, and Exercise Relationships (in **both**
        directions — a link references the Exercise whether it is the ``from`` or the ``to``)
        that reference it (issue #507, ADR-0076). A non-zero count means the Exercise is
        settled shared state a live plan or Logged Set depends on and must never be destroyed;
        the delete route feeds this to ``can_hard_delete``. An unknown id counts ``0``.
        """
        ...

    def hard_delete(self, exercise_id: int) -> None:
        """Permanently remove one Catalog Exercise — the irreversible act (ADR-0076).

        The narrow exception to "membership is never deleted": the **caller has already
        checked the guard** (the Exercise is Retired and ``reference_count`` is 0), so this
        just removes the single row. Deleting a missing id is a harmless no-op (the route's
        404 guard runs first). The admin audit row survives the delete — its ``exercise_id``
        is a plain int with no FK — so the trail outlives the destroyed Exercise."""
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


def _clone_exercise(
    existing: Exercise,
    *,
    provenance: Provenance | _Unset = UNSET,
    description: str | None | _Unset = UNSET,
    targeted_muscles: Sequence[str] | _Unset = UNSET,
    primary_muscles: Sequence[str] | _Unset = UNSET,
    secondary_muscles: Sequence[str] | _Unset = UNSET,
    instructions: Sequence[str] | _Unset = UNSET,
    difficulty: int | None | _Unset = UNSET,
    precautions: Sequence[str] | _Unset = UNSET,
    retired: bool | _Unset = UNSET,
) -> Exercise:
    """Build a **fresh** Exercise from ``existing``, overriding only the named fields.

    The immutable twin of ``_apply_patch`` for the single-field writes — ``set_enrichment``,
    ``set_muscle_emphasis``, ``set_provenance``, ``set_precautions``, ``retire`` / ``unretire``:
    ``existing`` is read, never mutated, and a new Exercise is returned carrying its id and
    normalized identity. Every field left ``UNSET`` keeps its existing value, so each writer
    stays a "writes *only* X" act — enrichment never disturbs Provenance or the emphasis split,
    a provenance change never touches precautions, retiring never touches the descriptive set —
    and none of these acts rename the movement, touch ``required_equipment``, or write the
    ``image`` (spec §5, ADR-0041/0075/0076). ``UNSET`` (not ``None``) is the skip sentinel so a
    nullable ``description`` / ``difficulty`` can be cleared to ``None`` explicitly."""

    return Exercise(
        id=existing.id,
        name=existing.name,
        normalized_name=existing.normalized_name,
        provenance=existing.provenance if provenance is UNSET else provenance.value,
        description=existing.description if description is UNSET else description,
        targeted_muscles=list(
            existing.targeted_muscles if targeted_muscles is UNSET else targeted_muscles
        ),
        primary_muscles=list(
            existing.primary_muscles if primary_muscles is UNSET else primary_muscles
        ),
        secondary_muscles=list(
            existing.secondary_muscles
            if secondary_muscles is UNSET
            else secondary_muscles
        ),
        required_equipment=list(existing.required_equipment),
        instructions=list(
            existing.instructions if instructions is UNSET else instructions
        ),
        difficulty=existing.difficulty if difficulty is UNSET else difficulty,
        precautions=list(existing.precautions if precautions is UNSET else precautions),
        image=existing.image,
        retired=existing.retired if retired is UNSET else retired,
    )


def _apply_patch(existing: Exercise, patch: ExercisePatch) -> Exercise:
    """Build a **fresh** Exercise from ``existing`` with the ``patch``'s fields overlaid.

    Pure and immutable (coding-style): ``existing`` is read, never mutated, and a new
    Exercise is returned carrying its id. Every field the patch left ``UNSET`` keeps the
    existing value — including Provenance, precautions, the Image, and the retired flag,
    which this descriptive edit never touches — and a supplied ``name`` recomputes the
    normalized identity so the caller can detect a collision before persisting."""

    def _pick(value: object, current: object) -> object:
        return current if value is UNSET else value

    name = existing.name if patch.name is UNSET else patch.name
    return Exercise(
        id=existing.id,
        name=name,
        normalized_name=normalize_name(name),
        provenance=existing.provenance,
        description=_pick(patch.description, existing.description),
        targeted_muscles=list(_pick(patch.targeted_muscles, existing.targeted_muscles)),
        primary_muscles=list(_pick(patch.primary_muscles, existing.primary_muscles)),
        secondary_muscles=list(
            _pick(patch.secondary_muscles, existing.secondary_muscles)
        ),
        required_equipment=list(
            _pick(patch.required_equipment, existing.required_equipment)
        ),
        instructions=list(_pick(patch.instructions, existing.instructions)),
        difficulty=_pick(patch.difficulty, existing.difficulty),
        precautions=list(existing.precautions),
        image=existing.image,
        retired=existing.retired,
    )


def _visible(exercises: list[Exercise], *, include_retired: bool) -> list[Exercise]:
    """Drop the Retire-tombstoned rows from a discovery read unless the caller opts in.

    The one place the ``retired`` predicate is applied for the list-shaped discovery reads
    (``search``, ``browse``, ``browse_all``, ``list_all``, ``list_by_provenance``), so the SQL
    and in-memory repositories filter identically and never drift (ADR-0076). A blank/false
    ``include_retired`` hides retired Exercises; an admin readout passes ``True`` to span them.
    Returns a fresh list, never mutating the input."""

    if include_retired:
        return list(exercises)
    return [exercise for exercise in exercises if not exercise.retired]


def _page(matches: list[Exercise], limit: int, offset: int) -> ExerciseSearchPage:
    """Rank the matched Exercises and slice out the requested page.

    Ranking and pagination live here so the SQL and in-memory repositories share
    one ordering (the pure ``rank_exercise_matches``) and one slice rule, and never
    drift. ``total`` is the full match count before the slice."""

    ranked = rank_exercise_matches(matches)
    return ExerciseSearchPage(items=ranked[offset : offset + limit], total=len(ranked))


def _browse_matches(
    candidates: list[Exercise],
    *,
    muscle_groups: Sequence[MuscleGroup],
    equipment: Sequence[str],
    difficulty_bands: Sequence[DifficultyBand],
) -> list[Exercise]:
    """Filter and rank browse candidates, unsliced (ADR-0042).

    The shared facet predicate + ordering both the paged ``browse`` and the whole-set
    ``browse_all`` read (the taxonomy, ADR-0072) run through, so a movement appears in the
    same order and passes the same facets whichever surface asks. Equipment is normalized
    once here so the pure predicate compares on the same key on both sides."""

    groups = set(muscle_groups)
    kit = {normalize_equipment(item) for item in equipment}
    bands = set(difficulty_bands)
    filtered = [
        exercise
        for exercise in candidates
        if matches_filters(
            exercise, muscle_groups=groups, equipment=kit, difficulty_bands=bands
        )
    ]
    return rank_browse_results(filtered)


def _browse_page(
    candidates: list[Exercise],
    *,
    muscle_groups: Sequence[MuscleGroup],
    equipment: Sequence[str],
    difficulty_bands: Sequence[DifficultyBand],
    limit: int,
    offset: int,
) -> ExerciseSearchPage:
    """Filter, rank, and slice browse candidates (ADR-0042).

    Shared by the SQL and in-memory repositories so both apply one facet predicate, one
    ordering, and one slice rule and never drift — the browse twin of ``_page``. Filtering
    and ranking happen in ``_browse_matches``, *after* the name/list-all candidate set is
    gathered, so the ``total`` and the page reflect the filtered set."""

    ranked = _browse_matches(
        candidates,
        muscle_groups=muscle_groups,
        equipment=equipment,
        difficulty_bands=difficulty_bands,
    )
    return ExerciseSearchPage(items=ranked[offset : offset + limit], total=len(ranked))


def _admin_page(
    candidates: list[Exercise],
    *,
    filters: AdminBrowseFilters,
    limit: int,
    offset: int,
) -> ExerciseSearchPage:
    """Filter, order, and slice the admin browser's candidate set (issue #501).

    Shared by the SQL and in-memory repositories so both narrow through the one pure
    ``filter_admin_catalog`` and apply one slice rule — the admin twin of ``_browse_page``
    — and never drift. ``total`` is the full filtered count before the page slice."""

    filtered = filter_admin_catalog(candidates, filters)
    return ExerciseSearchPage(
        items=filtered[offset : offset + limit], total=len(filtered)
    )


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
        self, query: str, *, limit: int, offset: int, include_retired: bool = False
    ) -> ExerciseSearchPage:
        normalized = normalize_name(query)
        if not normalized:
            return ExerciseSearchPage(items=[], total=0)
        matches = list(
            self._session.exec(
                select(Exercise).where(Exercise.normalized_name.contains(normalized))
            ).all()
        )
        return _page(_visible(matches, include_retired=include_retired), limit, offset)

    def browse(
        self,
        *,
        query: str,
        muscle_groups: Sequence[MuscleGroup],
        equipment: Sequence[str],
        difficulty_bands: Sequence[DifficultyBand],
        limit: int,
        offset: int,
        include_retired: bool = False,
    ) -> ExerciseSearchPage:
        normalized = normalize_name(query)
        statement = select(Exercise)
        if normalized:
            statement = statement.where(Exercise.normalized_name.contains(normalized))
        candidates = list(self._session.exec(statement).all())
        return _browse_page(
            _visible(candidates, include_retired=include_retired),
            muscle_groups=muscle_groups,
            equipment=equipment,
            difficulty_bands=difficulty_bands,
            limit=limit,
            offset=offset,
        )

    def browse_all(
        self,
        *,
        query: str,
        muscle_groups: Sequence[MuscleGroup],
        equipment: Sequence[str],
        difficulty_bands: Sequence[DifficultyBand],
        include_retired: bool = False,
    ) -> list[Exercise]:
        normalized = normalize_name(query)
        statement = select(Exercise)
        if normalized:
            statement = statement.where(Exercise.normalized_name.contains(normalized))
        candidates = list(self._session.exec(statement).all())
        return _browse_matches(
            _visible(candidates, include_retired=include_retired),
            muscle_groups=muscle_groups,
            equipment=equipment,
            difficulty_bands=difficulty_bands,
        )

    def admin_browse(
        self, *, filters: AdminBrowseFilters, limit: int, offset: int
    ) -> ExerciseSearchPage:
        # The whole Catalog is the candidate set — no status/provenance predicate — so
        # the ops view spans everything; the pure filter then narrows and orders it. The
        # catalog is a bounded shared set, so loading it and filtering in Python keeps the
        # SQL and in-memory reads on one code path (the browse/taxonomy approach, ADR-0042).
        candidates = list(self._session.exec(select(Exercise)).all())
        return _admin_page(candidates, filters=filters, limit=limit, offset=offset)

    def list_by_provenance(
        self, provenance: Provenance, *, include_retired: bool = False
    ) -> list[Exercise]:
        rows = list(
            self._session.exec(
                select(Exercise).where(Exercise.provenance == provenance.value)
            ).all()
        )
        return _visible(rows, include_retired=include_retired)

    def list_all(self, *, include_retired: bool = False) -> list[Exercise]:
        rows = list(self._session.exec(select(Exercise)).all())
        return _visible(rows, include_retired=include_retired)

    def set_enrichment(
        self,
        exercise_id: int,
        *,
        description: str | None,
        targeted_muscles: Sequence[str],
        instructions: Sequence[str],
        difficulty: int | None,
    ) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        return self._persist_fresh(
            existing,
            _clone_exercise(
                existing,
                description=description,
                targeted_muscles=targeted_muscles,
                instructions=instructions,
                difficulty=difficulty,
            ),
        )

    def set_muscle_emphasis(
        self,
        exercise_id: int,
        *,
        primary_muscles: Sequence[str],
        secondary_muscles: Sequence[str],
    ) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        return self._persist_fresh(
            existing,
            _clone_exercise(
                existing,
                primary_muscles=primary_muscles,
                secondary_muscles=secondary_muscles,
            ),
        )

    def set_provenance(
        self, exercise_id: int, provenance: Provenance
    ) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        return self._persist_fresh(
            existing, _clone_exercise(existing, provenance=provenance)
        )

    def set_precautions(
        self, exercise_id: int, precautions: Sequence[str]
    ) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        return self._persist_fresh(
            existing, _clone_exercise(existing, precautions=precautions)
        )

    def update(self, exercise_id: int, patch: ExercisePatch) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        merged = _apply_patch(existing, patch)
        if merged.normalized_name != existing.normalized_name:
            collision = self._lookup(merged.normalized_name)
            if collision is not None and collision.id != exercise_id:
                raise NameCollision(merged.normalized_name)
        return self._persist_fresh(existing, merged)

    def retire(self, exercise_id: int) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        return self._persist_fresh(existing, _clone_exercise(existing, retired=True))

    def unretire(self, exercise_id: int) -> Exercise | None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            return None
        return self._persist_fresh(existing, _clone_exercise(existing, retired=False))

    def reference_count(self, exercise_id: int) -> int:
        prescriptions = self._count(
            select(func.count())
            .select_from(ExercisePrescription)
            .where(ExercisePrescription.exercise_id == exercise_id)
        )
        logged_sets = self._count(
            select(func.count())
            .select_from(LoggedSet)
            .where(LoggedSet.exercise_id == exercise_id)
        )
        # A relationship references the Exercise whether it is the ``from`` or the ``to`` end,
        # so both directions count toward the guard (ADR-0076: "no Relationship points at it").
        relationships = self._count(
            select(func.count())
            .select_from(ExerciseRelationship)
            .where(
                or_(
                    ExerciseRelationship.from_exercise_id == exercise_id,
                    ExerciseRelationship.to_exercise_id == exercise_id,
                )
            )
        )
        return prescriptions + logged_sets + relationships

    def _count(self, statement: SelectOfScalar[int]) -> int:
        """Run a ``select(func.count())…`` statement and return the single scalar count."""

        return self._session.exec(statement).one()

    def hard_delete(self, exercise_id: int) -> None:
        existing = self._session.get(Exercise, exercise_id)
        if existing is None:
            # Idempotent: the route's 404 guard runs first, so a miss here is a benign no-op.
            return
        self._session.delete(existing)
        self._session.commit()

    def _persist_fresh(self, existing: Exercise, fresh: Exercise) -> Exercise:
        """Persist ``fresh`` over ``existing`` without mutating the caller's row.

        The shared immutable-write mechanic for every single-row writer here (``update``,
        ``set_provenance``, ``set_precautions``): detach the row the caller holds so the write
        never mutates it in place, then ``merge`` the fresh state onto a newly loaded managed
        instance. ``merge`` reconciles by primary key, so the single catalog row is updated
        (not duplicated) and returned as a fresh Exercise."""

        self._session.expunge(existing)
        persistent = self._session.merge(fresh)
        self._session.commit()
        self._session.refresh(persistent)
        return persistent


class InMemoryExerciseRepository:
    def __init__(self) -> None:
        self._by_key: dict[str, Exercise] = {}
        self._by_id: dict[int, Exercise] = {}
        self._next_id = 1
        # The fake's stand-in for the three real reference tables (Prescriptions, Logged
        # Sets, Relationships), which live in other repositories the SQL query joins across.
        # Tests seed it through ``register_reference`` so the route/service delete logic can
        # be exercised offline; the SQL implementation is the source of truth for the real
        # count and is verified against a database (ADR-0076).
        self._references: dict[int, int] = {}

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
        self, query: str, *, limit: int, offset: int, include_retired: bool = False
    ) -> ExerciseSearchPage:
        normalized = normalize_name(query)
        if not normalized:
            return ExerciseSearchPage(items=[], total=0)
        matches = [
            exercise
            for exercise in self._by_id.values()
            if normalized in exercise.normalized_name
        ]
        return _page(_visible(matches, include_retired=include_retired), limit, offset)

    def browse(
        self,
        *,
        query: str,
        muscle_groups: Sequence[MuscleGroup],
        equipment: Sequence[str],
        difficulty_bands: Sequence[DifficultyBand],
        limit: int,
        offset: int,
        include_retired: bool = False,
    ) -> ExerciseSearchPage:
        normalized = normalize_name(query)
        candidates = [
            exercise
            for exercise in self._by_id.values()
            if not normalized or normalized in exercise.normalized_name
        ]
        return _browse_page(
            _visible(candidates, include_retired=include_retired),
            muscle_groups=muscle_groups,
            equipment=equipment,
            difficulty_bands=difficulty_bands,
            limit=limit,
            offset=offset,
        )

    def browse_all(
        self,
        *,
        query: str,
        muscle_groups: Sequence[MuscleGroup],
        equipment: Sequence[str],
        difficulty_bands: Sequence[DifficultyBand],
        include_retired: bool = False,
    ) -> list[Exercise]:
        normalized = normalize_name(query)
        candidates = [
            exercise
            for exercise in self._by_id.values()
            if not normalized or normalized in exercise.normalized_name
        ]
        return _browse_matches(
            _visible(candidates, include_retired=include_retired),
            muscle_groups=muscle_groups,
            equipment=equipment,
            difficulty_bands=difficulty_bands,
        )

    def admin_browse(
        self, *, filters: AdminBrowseFilters, limit: int, offset: int
    ) -> ExerciseSearchPage:
        candidates = list(self._by_id.values())
        return _admin_page(candidates, filters=filters, limit=limit, offset=offset)

    def list_by_provenance(
        self, provenance: Provenance, *, include_retired: bool = False
    ) -> list[Exercise]:
        rows = [
            exercise
            for exercise in self._by_id.values()
            if exercise.provenance == provenance.value
        ]
        return _visible(rows, include_retired=include_retired)

    def list_all(self, *, include_retired: bool = False) -> list[Exercise]:
        return _visible(list(self._by_id.values()), include_retired=include_retired)

    def set_enrichment(
        self,
        exercise_id: int,
        *,
        description: str | None,
        targeted_muscles: Sequence[str],
        instructions: Sequence[str],
        difficulty: int | None,
    ) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        return self._store_fresh(
            _clone_exercise(
                existing,
                description=description,
                targeted_muscles=targeted_muscles,
                instructions=instructions,
                difficulty=difficulty,
            )
        )

    def set_muscle_emphasis(
        self,
        exercise_id: int,
        *,
        primary_muscles: Sequence[str],
        secondary_muscles: Sequence[str],
    ) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        return self._store_fresh(
            _clone_exercise(
                existing,
                primary_muscles=primary_muscles,
                secondary_muscles=secondary_muscles,
            )
        )

    def set_provenance(
        self, exercise_id: int, provenance: Provenance
    ) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        fresh = _clone_exercise(existing, provenance=provenance)
        return self._store_fresh(fresh)

    def set_precautions(
        self, exercise_id: int, precautions: Sequence[str]
    ) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        fresh = _clone_exercise(existing, precautions=precautions)
        return self._store_fresh(fresh)

    def _store_fresh(self, fresh: Exercise) -> Exercise:
        """Replace the stored entry with ``fresh`` rather than mutating the caller's row.

        The immutable-write mechanic for the single-field curator writers, which never rename,
        so the normalized-name key is unchanged and re-keying (as ``update`` does on a rename)
        is unnecessary."""

        self._by_key[fresh.normalized_name] = fresh
        self._by_id[fresh.id] = fresh
        return fresh

    def update(self, exercise_id: int, patch: ExercisePatch) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        merged = _apply_patch(existing, patch)
        old_key = existing.normalized_name
        new_key = merged.normalized_name
        if new_key != old_key:
            collision = self._by_key.get(new_key)
            if collision is not None and collision.id != exercise_id:
                raise NameCollision(new_key)
            del self._by_key[old_key]
        # Immutable write: replace the stored entry with the fresh Exercise rather than
        # mutating the one the caller may still hold. Re-key under the new normalized name
        # when a rename moved the identity.
        self._by_key[new_key] = merged
        self._by_id[exercise_id] = merged
        return merged

    def retire(self, exercise_id: int) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        return self._store_fresh(_clone_exercise(existing, retired=True))

    def unretire(self, exercise_id: int) -> Exercise | None:
        existing = self._by_id.get(exercise_id)
        if existing is None:
            return None
        return self._store_fresh(_clone_exercise(existing, retired=False))

    def register_reference(self, exercise_id: int, *, count: int = 1) -> None:
        """Test seam: record that ``count`` things reference ``exercise_id``.

        Not part of the ``ExerciseRepository`` contract — the fake has no Prescription /
        Logged Set / Relationship tables of its own, so tests use this to model that the
        Exercise is referenced and drive the hard-delete guard offline."""

        self._references[exercise_id] = self._references.get(exercise_id, 0) + count

    def reference_count(self, exercise_id: int) -> int:
        return self._references.get(exercise_id, 0)

    def hard_delete(self, exercise_id: int) -> None:
        existing = self._by_id.pop(exercise_id, None)
        if existing is None:
            # Idempotent: the route's 404 guard runs first, so a miss here is a benign no-op.
            return
        self._by_key.pop(existing.normalized_name, None)
        self._references.pop(exercise_id, None)


__all__ = [
    "ExercisePatch",
    "ExerciseRepository",
    "ExerciseSearchPage",
    "NameCollision",
    "ResolvedExercise",
    "SqlExerciseRepository",
    "InMemoryExerciseRepository",
    "UNSET",
]
