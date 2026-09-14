"""Exercise catalog routes: read one Exercise's enriched detail.

``GET /api/exercises/{id}`` returns the shared catalog Exercise — its description,
execution instructions, targeted muscles, difficulty, required equipment, and
precautions — together with its typed relationships split into Variations and
Alternatives (Slice 11). The catalog is global, but the endpoint requires
authentication like the rest of the API. Responses use the standard envelope."""

from __future__ import annotations

import html
import logging
from enum import Enum
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, field_validator

from app.auth.dependencies import get_current_user, require_admin
from app.db.models import Exercise
from app.domain.exercise import (
    CatalogCompleteness,
    Provenance,
    catalog_completeness,
    completeness_breakdown,
    normalize_name,
)
from app.domain.exercise_admin import AdminBrowseFilters
from app.domain.exercise_audit import AuditAction, provenance_change_detail
from app.domain.exercise_browse import (
    distinct_equipment,
    parse_difficulty_band,
    parse_muscle_group,
)
from app.domain.exercise_usage import last_performed
from app.domain.movement_pattern import (
    classify_movement_pattern,
    group_by_movement_pattern,
)
from app.domain.substitution import RelationKind
from app.envelope import success_envelope
from app.generation.backfill_queue import BackfillQueue
from app.generation.enrichment_queue import EnrichmentQueue
from app.repositories.deps import (
    get_backfill_queue,
    get_enrichment_queue,
    get_exercise_audit_repository,
    get_exercise_image_repository,
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_logged_session_repository,
)
from app.repositories.exercise_audit_repository import (
    AuditRecord,
    ExerciseAuditRepository,
)
from app.repositories.exercise_image_repository import ExerciseImageRepository
from app.repositories.exercise_relationship_repository import (
    DirectedRelationship,
    DuplicateRelationshipError,
    ExerciseRelationshipRepository,
    RelatedExercise,
    SelfLinkError,
)
from app.repositories.exercise_repository import (
    ExercisePatch,
    ExerciseRepository,
    NameCollision,
)
from app.repositories.logged_session_repository import LoggedSessionRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["exercises"])

HTTP_NOT_FOUND = 404
HTTP_ACCEPTED = 202
HTTP_CREATED = 201
HTTP_NO_CONTENT = 204
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422

# The stored difficulty is a 1–10 scale aligned with Fitness Level (models.Exercise); an
# admin edit is held to the same bounds so a bad value never enters the shared catalog.
MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 10

# The Exercise Library page bounds: a sensible default page and a cap so one search
# never returns an unbounded slice of the catalog.
DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 50

# The admin catalog browser (issue #501) reads a bounded shared set, so its page cap is
# generous — the ops UI pulls the whole catalog in one page and filters/searches it
# client-side — while still bounding any single read.
ADMIN_BROWSE_DEFAULT_LIMIT = 50
ADMIN_BROWSE_MAX_LIMIT = 500

# The sane upper bound on a user-typed movement name: long enough for any real
# movement, short enough to reject a junk paste before it enters the shared catalog.
MAX_NAME_LENGTH = 100


def _search_result(exercise: Exercise) -> dict:
    """The pick-only Library projection of a catalog Exercise: just enough to choose
    a movement and know if it is unvalidated. Provenance is surfaced exactly as the
    Session view and Exercise Detail do (ADR-0021). Catalog Completeness is *not*
    surfaced here: it is an internal/ops axis (ADR-0041, revised) — a server-side
    ranking + Enrichment input only, read in the admin readout, never on this
    user-facing response."""

    return {
        "id": exercise.id,
        "name": exercise.name,
        "targeted_muscles": list(exercise.targeted_muscles),
        "required_equipment": list(exercise.required_equipment),
        "difficulty": exercise.difficulty,
        "provenance": exercise.provenance,
        # The broad Movement Pattern (ADR-0072): a read-time projection over the
        # movement's name and muscles, so the field-guide row and its taxonomy section
        # agree on which family the entry belongs to. Never a stored column.
        "movement_pattern": classify_movement_pattern(exercise).value,
    }


@router.get("/exercises")
def browse_exercises(
    query: str = Query(default="", description="Name substring to match."),
    muscle_group: list[str] = Query(
        default=[], description="Curated Muscle Group facet (repeatable)."
    ),
    equipment: list[str] = Query(
        default=[], description="Required-equipment facet (repeatable)."
    ),
    difficulty: list[str] = Query(
        default=[], description="Difficulty band facet: beginner|intermediate|advanced."
    ),
    limit: int = Query(default=DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT),
    offset: int = Query(default=0, ge=0),
    _: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """List the shared Catalog for the Exercise Library and the Browse surface.

    A **blank** ``query`` lists the whole Catalog (ADR-0042); a non-blank one substring-
    matches by normalized name (the pick-only Exercise Library path, ADR-0021). The three
    optional facets — ``muscle_group`` (curated six buckets), ``equipment``, and
    ``difficulty`` band — narrow the list (AND across facets, OR within each), which is
    ranked curated → completeness → name and paginated. Unrecognized facet values are
    dropped rather than erroring the whole read. Read-only: browsing never creates a
    catalog Exercise. Responses use the standard envelope with pagination meta."""

    muscle_groups = [
        group for raw in muscle_group if (group := parse_muscle_group(raw)) is not None
    ]
    difficulty_bands = [
        band for raw in difficulty if (band := parse_difficulty_band(raw)) is not None
    ]
    page = exercises.browse(
        query=query,
        muscle_groups=muscle_groups,
        equipment=equipment,
        difficulty_bands=difficulty_bands,
        limit=limit,
        offset=offset,
    )
    return success_envelope(
        [_search_result(exercise) for exercise in page.items],
        meta={"total": page.total, "limit": limit, "offset": offset},
    )


@router.get("/exercises/facets")
def exercise_facets(
    _: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """Return the option lists that drive the Browse facets (ADR-0042).

    Only ``equipment`` needs the server — it is the Catalog's distinct required-equipment
    labels (deduped case-insensitively, sorted), since equipment is free-form. The Muscle
    Group buckets and difficulty bands are fixed and live as frontend constants, so they
    are not restated here. Declared before ``/exercises/{exercise_id}`` so the literal
    path is never mistaken for an id."""

    return success_envelope({"equipment": distinct_equipment(exercises.list_all())})


@router.get("/exercises/usage")
def exercise_usage(
    user: str = Depends(get_current_user),
    logged_sessions: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """Return the caller's per-Exercise last-performed map for the Browse markers (ADR-0042).

    A read-time projection over the user's Logged Sessions (``last_performed``): one entry
    per Exercise the user has ever performed, with the most recent ``performed_on`` as an
    ISO date. The Browse rows read it into a strictly descriptive TRAINED / NEW marker —
    an Exercise absent from the map is NEW. Kept separate from the Catalog read so that
    read stays user-agnostic and the Library picker's per-keystroke cost is unchanged.
    Declared before ``/exercises/{exercise_id}`` so the literal path wins."""

    usage = last_performed(logged_sessions.list_for_user(user))
    return success_envelope(
        [
            {"exercise_id": exercise_id, "last_performed_on": performed_on.isoformat()}
            for exercise_id, performed_on in usage.items()
        ]
    )


@router.get("/exercises/taxonomy")
def browse_taxonomy(
    query: str = Query(default="", description="Name substring to match."),
    muscle_group: list[str] = Query(
        default=[], description="Curated Muscle Group facet (repeatable)."
    ),
    equipment: list[str] = Query(
        default=[], description="Required-equipment facet (repeatable)."
    ),
    difficulty: list[str] = Query(
        default=[], description="Difficulty band facet: beginner|intermediate|advanced."
    ),
    _: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """The Catalog grouped into the field-guide Movement Pattern taxonomy (ADR-0072).

    Applies the same query + facet narrowing as ``GET /exercises`` (AND across facets, OR
    within each; unknown facet values dropped), then groups the **whole** filtered set by
    broad Movement Pattern — Squat, Hinge, Push, Pull, Carry, Locomotion, Core, then a
    General bucket — in canonical order with empty patterns omitted. Each group carries its
    ranked exercises (curated → completeness → name) and an accurate ``count``; the pattern
    is a read-time projection, so this endpoint owns no new state. Unpaged: the taxonomy
    needs the whole filtered set to group it, and the catalog is a bounded shared set.
    Declared before ``/exercises/{exercise_id}`` so the literal path wins. Read-only."""

    muscle_groups = [
        group for raw in muscle_group if (group := parse_muscle_group(raw)) is not None
    ]
    difficulty_bands = [
        band for raw in difficulty if (band := parse_difficulty_band(raw)) is not None
    ]
    matches = exercises.browse_all(
        query=query,
        muscle_groups=muscle_groups,
        equipment=equipment,
        difficulty_bands=difficulty_bands,
    )
    groups = group_by_movement_pattern(matches)
    return success_envelope(
        {
            "groups": [
                {
                    "pattern": pattern.value,
                    "count": len(members),
                    "exercises": [_search_result(exercise) for exercise in members],
                }
                for pattern, members in groups
            ],
        },
        meta={"total": sum(len(members) for _, members in groups)},
    )


class CreateExerciseBody(BaseModel):
    """A request to resolve-or-create a catalog Exercise by name (ADR-0033).

    The plan-less log picker (ADR-0031) posts this when a user names a movement the
    catalog may not yet hold. The name must have a non-empty normalized identity and
    stay within ``MAX_NAME_LENGTH`` — the two boundary guards that keep whitespace and
    junk pastes out of the shared global catalog."""

    name: str

    @field_validator("name")
    @classmethod
    def _has_normalized_identity(cls, value: str) -> str:
        if not normalize_name(value):
            raise ValueError("name must not be blank")
        if len(value.strip()) > MAX_NAME_LENGTH:
            raise ValueError(f"name must be at most {MAX_NAME_LENGTH} characters")
        return value


@router.post("/exercises")
def create_exercise(
    payload: CreateExerciseBody,
    _: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    enrichment_queue: EnrichmentQueue = Depends(get_enrichment_queue),
) -> dict:
    """Resolve ``name`` to a catalog Exercise, creating a ``user_entered`` one on a miss.

    Dedup is by normalized name (ADR-0002), so an existing entry — curated, AI, or a
    prior user-entered one — is returned as-is with its Provenance untouched; only a
    genuine miss mints a new, name-only ``user_entered`` movement. This is the sole
    place a user's typed movement enters the catalog; the log write stays id-only and
    never mints (ADR-0031/0033). Because both the plan-less log picker and the
    hand-authoring flow resolve names here before referencing Exercises by id, this
    one hook covers both paths (user story 25).

    On a genuine create the new Stub is enriched out-of-band: an Enrichment job is
    enqueued so a worker fills its description and muscles later (issue #309,
    ADR-0041), while the synchronous write above stays a pure name-only insert with
    no AI call (ADR-0002). A dedup hit enqueues nothing — an existing movement is not
    re-enriched by this path. Responses use the standard envelope."""

    resolved = exercises.resolve_or_create(
        payload.name, provenance=Provenance.USER_ENTERED
    )
    if resolved.created:
        _enqueue_enrichment(enrichment_queue, resolved.exercise.id)
    return success_envelope(_search_result(resolved.exercise))


def _enqueue_enrichment(enrichment_queue: EnrichmentQueue, exercise_id: int) -> None:
    """Best-effort enqueue of the async Enrichment job for a newly minted Stub.

    The movement is already committed by the time we get here, so a queue failure
    (e.g. Redis unreachable) must not fail the create — frictionless creation is never
    blocked (ADR-0002, user story 1). We log and move on; the Stub simply stays
    un-enriched until the idempotent-friendly backfill lifts it later, rather than the
    user seeing an error for a movement that exists."""

    try:
        enrichment_queue.enqueue(exercise_id)
    except Exception:  # the enqueue is fire-and-forget; never fail the create on it
        logger.warning(
            "failed to enqueue enrichment for exercise %s", exercise_id, exc_info=True
        )


def _backfill_payload(
    *, status: str, job_id: str | None, summary: dict | None, error: str | None
) -> dict:
    """The uniform envelope the operator polls for a backfill run (ADR-0046).

    ``status=pending`` carries a ``job_id`` to poll; ``status=complete`` fills in the
    ``summary`` counts (enriched / skipped_*); ``status=failed`` carries a user-safe
    ``error``. Mirrors the Protocol-generation job envelope, with a summary in place of
    a ``protocol_id``."""

    return {
        "status": status,
        "job_id": job_id,
        "summary": summary,
        "error": error,
    }


@router.post("/exercises/enrichment-backfill")
def trigger_enrichment_backfill(
    response: Response,
    _operator: str = Depends(require_admin),
    backfill_queue: BackfillQueue = Depends(get_backfill_queue),
) -> dict:
    """Enqueue a Stub-enrichment backfill sweep over the whole catalog (ADR-0046).

    An **operator-only** maintenance trigger (``require_admin``): it hands the sweep to
    the background worker and returns a ``202`` with a ``job_id`` to poll — nothing
    blocks on the AI here, since a real catalog is one LLM call per fillable Stub. The
    sweep runs under one fixed job id, so a double-trigger while a run is still in
    flight returns that same in-flight handle rather than starting a second overlapping
    sweep. The lift itself is the shared, idempotent-friendly backfill (ADR-0041):
    Stubs rise to Listable, and rows already at or above the bar cost no AI call."""

    job_id = backfill_queue.enqueue()
    response.status_code = HTTP_ACCEPTED
    return success_envelope(
        _backfill_payload(status="pending", job_id=job_id, summary=None, error=None)
    )


@router.get("/exercises/enrichment-backfill/jobs/{job_id}")
def read_enrichment_backfill_job(
    job_id: str,
    _operator: str = Depends(require_admin),
    backfill_queue: BackfillQueue = Depends(get_backfill_queue),
) -> dict:
    """Poll a Stub-enrichment backfill run (ADR-0046), operator-only.

    Returns ``pending`` until the worker finishes, then ``complete`` with the summary
    counts (enriched / skipped_already_complete / skipped_nothing_to_work_from /
    skipped_unfillable), or ``failed`` with a user-safe message. An unknown id is 404.
    """

    state = backfill_queue.get_state(job_id)
    if state is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Job not found")
    return success_envelope(
        _backfill_payload(
            status=state.status.value,
            job_id=job_id,
            summary=state.summary,
            error=state.error,
        )
    )


@router.get("/exercises/completeness-breakdown")
def read_completeness_breakdown(
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """Catalog-health counts by Completeness tier (ADR-0041, revised), operator-only.

    Decision-support for the adjacent enrichment backfill: how much of the corpus is
    sub-bar and whether Enrichment is keeping up. Catalog Completeness is an
    internal/ops axis — never surfaced on a user-facing catalog/library/detail read —
    so this aggregate lives behind ``require_admin`` alongside the backfill trigger.
    Declared before ``/exercises/{exercise_id}`` so the literal path is never mistaken
    for an id. Responses use the standard envelope."""

    # An admin catalog-health readout spans retired rows too (ADR-0076): a curator sizing the
    # enrichment backlog wants the whole corpus, not the discovery-visible subset.
    breakdown = completeness_breakdown(exercises.list_all(include_retired=True))
    return success_envelope(
        {
            "stub": breakdown.stub,
            "listable": breakdown.listable,
            "enriched": breakdown.enriched,
            "total": breakdown.total,
        }
    )


def _admin_row(exercise: Exercise) -> dict:
    """One row of the admin catalog browser (issue #501, ADR-0076).

    Unlike the user-facing ``_search_result``, this ops row surfaces the two axes the
    public catalog deliberately hides: the computed Catalog Completeness tier (ADR-0041)
    and the ``retired`` tombstone (ADR-0076, for the later editor). ``id`` and ``name`` are
    enough for a row to link toward the editor; the tier is the read-time projection, never
    a stored column."""

    return {
        "id": exercise.id,
        "name": exercise.name,
        "provenance": exercise.provenance,
        "completeness": catalog_completeness(exercise).value,
        "retired": exercise.retired,
    }


_EnumT = TypeVar("_EnumT", bound=Enum)


def _parse_enum(enum_cls: type[_EnumT], raw: str | None) -> _EnumT | None:
    """Parse a filter value into ``enum_cls``, dropping an unrecognized value.

    Mirrors the Browse facets' lenient parsing (ADR-0042): a blank or unknown value
    narrows nothing instead of 422ing the whole read. Shared by the ``provenance`` and
    ``completeness`` browser filters so the two parse identically."""

    try:
        return enum_cls(raw) if raw else None
    except ValueError:
        return None


@router.get("/admin/exercises")
def admin_browse_exercises(
    q: str = Query(default="", description="Case-insensitive name substring."),
    provenance: str | None = Query(
        default=None, description="Filter by Provenance: curated|ai_generated|user_entered."
    ),
    completeness: str | None = Query(
        default=None, description="Filter by Completeness tier: stub|listable|enriched."
    ),
    retired: bool | None = Query(
        default=None, description="Filter by retired (true) / active (false); omit for both."
    ),
    limit: int = Query(default=ADMIN_BROWSE_DEFAULT_LIMIT, ge=1, le=ADMIN_BROWSE_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """The operator-only admin catalog browser (issue #501, ADR-0075/0076).

    A paged, filterable ops view over the **whole** shared Catalog — every Provenance,
    every Completeness tier (Stubs included), and both retired and active rows, unlike the
    user-facing, Listable-only library. Each row carries its computed Completeness tier (the
    internal signal hidden from the public catalog) and its retired state (for the later
    editor). The four filters — name search, Provenance, Completeness tier, retired/active —
    compose (AND'd); an unrecognized Provenance or tier value is dropped rather than
    erroring the read (ADR-0042 style). Behind ``require_admin`` (ADR-0046): a non-operator
    is rejected. Declared before ``/exercises/{exercise_id}`` is irrelevant here — the
    ``/admin`` prefix never collides with an id. Responses use the standard paginated
    envelope."""

    filters = AdminBrowseFilters(
        query=q,
        provenance=_parse_enum(Provenance, provenance),
        completeness=_parse_enum(CatalogCompleteness, completeness),
        retired=retired,
    )
    page = exercises.admin_browse(filters=filters, limit=limit, offset=offset)
    return success_envelope(
        [_admin_row(exercise) for exercise in page.items],
        meta={"total": page.total, "limit": limit, "offset": offset},
    )


def _summary(related: RelatedExercise) -> dict:
    return {"id": related.exercise.id, "name": related.exercise.name}


def _serialize(
    exercise: Exercise, related: list[RelatedExercise], *, has_image: bool
) -> dict:
    return {
        "id": exercise.id,
        "name": exercise.name,
        "description": exercise.description,
        "provenance": exercise.provenance,
        # The flat union stays the durable analytics-facing field; the
        # Primary/Secondary emphasis split (ADR-0016) rides alongside it, empty
        # when the Exercise asserts no primacy.
        "targeted_muscles": list(exercise.targeted_muscles),
        "primary_muscles": list(exercise.primary_muscles),
        "secondary_muscles": list(exercise.secondary_muscles),
        "required_equipment": list(exercise.required_equipment),
        "instructions": list(exercise.instructions),
        "difficulty": exercise.difficulty,
        "precautions": list(exercise.precautions),
        # The legacy Exercise Image (ADR-0041): a curated-source illustration
        # reference (URL / asset key), ``null`` when the movement carries none. Its
        # absence never degrades the Detail response — a movement with no picture is
        # still fully usable.
        "image": exercise.image,
        # Whether a curator-uploaded image exists (issue #504); the frontend serves it
        # (``GET /{id}/image``) when true, else the legacy ``image`` URL (ADR-0041).
        "has_image": has_image,
        # The Catalog Retire tombstone (ADR-0076): a Retired Exercise still resolves by id
        # (this route) so existing references never break, and the admin editor reads this
        # flag to offer Retire / un-Retire. Discovery surfaces exclude retired Exercises
        # upstream, so a row reaching a user here is active in practice.
        "retired": exercise.retired,
        # Catalog Completeness is deliberately absent (ADR-0041, revised): the
        # Stub | Listable | Enriched tier is an internal/ops axis, surfaced only in
        # the admin Catalog Enrichment readout, never on this user-facing detail.
        "variations": [
            _summary(r) for r in related if r.kind == RelationKind.VARIATION
        ],
        "alternatives": [
            _summary(r) for r in related if r.kind == RelationKind.ALTERNATIVE
        ],
    }


@router.get("/exercises/{exercise_id}")
def read_exercise(
    exercise_id: int,
    _: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    related = relationships.substitutes_for(exercise_id)
    return success_envelope(
        _serialize(exercise, related, has_image=images.exists(exercise_id))
    )


class UpdateExerciseBody(BaseModel):
    """A partial edit of one Catalog Exercise's descriptive fields (issue #502, spec §5).

    Every field is optional: only the fields the admin changed are sent, and a field left
    out is left untouched. The body spans exactly the descriptive set — display name,
    description, Execution Steps, targeted muscles, required equipment, difficulty — and
    the Primary/Secondary emphasis split; Provenance, precautions, the Image, and the
    retired tombstone are each a separate deliberate act with its own endpoint and are not
    editable here. Boundary validation mirrors the create path: a supplied name must have a
    non-empty normalized identity within ``MAX_NAME_LENGTH``, a supplied difficulty sits in
    1–10, and list items are trimmed with blanks dropped. ``description`` and ``difficulty``
    accept an explicit ``null`` to clear them; the presence of a key (not its value) is what
    marks a field as edited."""

    name: str | None = None
    description: str | None = None
    targeted_muscles: list[str] | None = None
    primary_muscles: list[str] | None = None
    secondary_muscles: list[str] | None = None
    required_equipment: list[str] | None = None
    instructions: list[str] | None = None
    difficulty: int | None = None

    @field_validator("name")
    @classmethod
    def _has_normalized_identity(cls, value: str | None) -> str | None:
        # A rename must resolve to a real normalized identity; a blank/whitespace name
        # would map two movements onto one key (or none at all), so reject it (ADR-0002).
        if value is None or not normalize_name(value):
            raise ValueError("name must not be blank")
        if len(value.strip()) > MAX_NAME_LENGTH:
            raise ValueError(f"name must be at most {MAX_NAME_LENGTH} characters")
        return value

    @field_validator("difficulty")
    @classmethod
    def _difficulty_in_range(cls, value: int | None) -> int | None:
        if value is not None and not (MIN_DIFFICULTY <= value <= MAX_DIFFICULTY):
            raise ValueError(
                f"difficulty must be between {MIN_DIFFICULTY} and {MAX_DIFFICULTY}"
            )
        return value

    @field_validator(
        "targeted_muscles",
        "primary_muscles",
        "secondary_muscles",
        "required_equipment",
        "instructions",
    )
    @classmethod
    def _clean_list(cls, value: list[str] | None) -> list[str] | None:
        # Trim each entry and drop blanks so a stray empty row from the editor never
        # enters the shared catalog; a provided-but-empty list still clears the field.
        if value is None:
            return None
        return [item.strip() for item in value if item.strip()]


def _build_patch(payload: UpdateExerciseBody) -> ExercisePatch:
    """Turn the request body into an ``ExercisePatch`` of *only the supplied fields*.

    ``exclude_unset`` keeps the sent keys — including an explicit ``null`` — and drops the
    rest, so ``ExercisePatch`` receives exactly the fields the admin edited and leaves
    every other field on its ``UNSET`` sentinel (the writer then preserves it)."""

    return ExercisePatch(**payload.model_dump(exclude_unset=True))


@router.patch("/exercises/{exercise_id}")
def update_exercise(
    exercise_id: int,
    payload: UpdateExerciseBody,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Partially edit one Catalog Exercise's descriptive fields (issue #502, spec §5).

    Operator-only (``require_admin``, ADR-0046): a non-operator is rejected before any
    write. Applies the partial ``ExercisePatch`` through the immutable repository writer
    and returns the updated Exercise via the standard envelope, in the same shape as
    ``GET /{id}``. A rename that would collide with a **different** movement's normalized
    name is a ``409`` that changes nothing (``NameCollision``, ADR-0002); a same-identity
    spelling/casing fix succeeds. A missing Exercise is ``404``; invalid input is ``422``
    (handled by the body model). Provenance, precautions, the Image, and the retired
    tombstone are never touched here — each is a separate deliberate act."""

    try:
        updated = exercises.update(exercise_id, _build_patch(payload))
    except NameCollision as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="Another exercise already uses that name.",
        ) from exc
    if updated is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    related = relationships.substitutes_for(exercise_id)
    return success_envelope(
        _serialize(updated, related, has_image=images.exists(exercise_id))
    )


class SetProvenanceBody(BaseModel):
    """A deliberate Provenance change on one Catalog Exercise (issue #503, ADR-0075).

    ``provenance`` is typed as the ``Provenance`` enum, so FastAPI rejects any value outside
    the vocabulary with a ``422`` before the handler runs — the "value is a member of
    ``Provenance``" validation (spec §3), with no gate function since any tier may move to any
    other (promote, correct, or demote)."""

    provenance: Provenance


class SetPrecautionsBody(BaseModel):
    """A write of one Catalog Exercise's curator-only precautions (issue #503, spec §5).

    ``precautions`` replaces the whole list (an empty list clears it). Each entry is trimmed
    with blanks dropped — a stray empty row from the editor never becomes a stored caution —
    and **HTML-escaped at this write boundary** so the stored value is inert wherever it later
    renders (the PWA, a CSV export, a future raw-HTML reader), independent of any frontend
    escaping (ADR-0036). A non-list body is a ``422`` (handled by the type)."""

    precautions: list[str]

    @field_validator("precautions")
    @classmethod
    def _clean_and_escape(cls, value: list[str]) -> list[str]:
        # Trim, drop blanks, then escape (quotes included) — the same one-time write-boundary
        # sanitizing the Note domain applies (app.domain.note.parse_note), here over a list.
        return [html.escape(item.strip(), quote=True) for item in value if item.strip()]


@router.put("/exercises/{exercise_id}/provenance")
def set_exercise_provenance(
    exercise_id: int,
    payload: SetProvenanceBody,
    operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    audit: ExerciseAuditRepository = Depends(get_exercise_audit_repository),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Deliberately set one Catalog Exercise's Provenance and audit the act (ADR-0075).

    Operator-only (``require_admin``, ADR-0046). This is the **one** path that mutates
    Provenance — a distinct, explicit act, never a side effect of editing other fields — so an
    admin may promote to ``curated`` when they have reviewed a movement, or correct/demote when
    content should not carry human-reviewed trust. An invalid tier is ``422`` (handled by the
    body model), a missing Exercise is ``404``, and neither writes anything. When the tier
    actually moves, the change is written to the append-only admin audit trail (who, when,
    old→new); setting the current tier again is an accepted no-op that records nothing, so the
    trail holds only real changes (ADR-0075). Returns the updated Exercise via the standard
    envelope in the same shape as ``GET /{id}``. No automated path (enrichment, generation,
    substitution) reaches this endpoint (ADR-0002/0075)."""

    existing = exercises.get(exercise_id)
    if existing is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    old_provenance = existing.provenance
    updated = exercises.set_provenance(exercise_id, payload.provenance)
    # ``existing`` was resolved above, so the write cannot miss; guard defensively anyway.
    if updated is None:  # pragma: no cover - unreachable after the resolve above
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    if updated.provenance != old_provenance:
        # Audit only a real change (ADR-0075): re-affirming the current tier writes no row.
        audit.record(
            exercise_id=exercise_id,
            actor=operator,
            action=AuditAction.PROVENANCE_CHANGE,
            detail=provenance_change_detail(old_provenance, updated.provenance),
        )
    related = relationships.substitutes_for(exercise_id)
    return success_envelope(
        _serialize(updated, related, has_image=images.exists(exercise_id))
    )


@router.put("/exercises/{exercise_id}/precautions")
def set_exercise_precautions(
    exercise_id: int,
    payload: SetPrecautionsBody,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Write one Catalog Exercise's curator-only precautions (issue #503, spec §5).

    Operator-only (``require_admin``, ADR-0046). The incoming list is trimmed and
    HTML-escaped at the boundary (handled by the body model) before it is stored, so the value
    is inert wherever it renders (ADR-0036). A missing Exercise is ``404``; a non-list body is
    ``422``. This writes *only* precautions — Provenance is untouched and, unlike a Provenance
    change, editing precautions is **not** audited. Returns the updated Exercise via the
    standard envelope in the same shape as ``GET /{id}``."""

    updated = exercises.set_precautions(exercise_id, payload.precautions)
    if updated is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    related = relationships.substitutes_for(exercise_id)
    return success_envelope(
        _serialize(updated, related, has_image=images.exists(exercise_id))
    )


@router.post("/exercises/{exercise_id}/retire")
def retire_exercise(
    exercise_id: int,
    operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    audit: ExerciseAuditRepository = Depends(get_exercise_audit_repository),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Retire one Catalog Exercise — the reversible soft tombstone (issue #506, ADR-0076).

    Operator-only (``require_admin``, ADR-0046): retirement is never a side effect of any
    other path. Sets the ``retired`` flag so the movement disappears from every discovery /
    candidate surface — catalog browse/search, the equipment facets, the taxonomy,
    Substitution candidates, and the Exercise-Detail variation/alternative sublist — while it
    stays fully resolvable by id, so no Exercise Prescription, Logged Set, or Relationship
    breaks. A missing Exercise is ``404``. The act is written to the append-only admin audit
    trail (who, when, ``retire``); retiring an already-retired row is an accepted idempotent
    no-op that records nothing, so the trail holds only real transitions. Returns the updated
    Exercise via the standard envelope in the same shape as ``GET /{id}``."""

    return _flip_retire(
        exercise_id,
        retire=True,
        operator=operator,
        exercises=exercises,
        relationships=relationships,
        audit=audit,
        images=images,
    )


@router.post("/exercises/{exercise_id}/unretire")
def unretire_exercise(
    exercise_id: int,
    operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    audit: ExerciseAuditRepository = Depends(get_exercise_audit_repository),
    images: ExerciseImageRepository = Depends(get_exercise_image_repository),
) -> dict:
    """Un-retire one Catalog Exercise for a clean restore (issue #506, ADR-0076).

    Operator-only (``require_admin``, ADR-0046): only an admin un-retires — un-retire is never
    an automated resurrection, so the AI re-inventing a junk name cannot undo a curator's
    decision. Clears the ``retired`` flag, fully restoring the movement to every discovery
    surface. A missing Exercise is ``404``. The act is written to the audit trail
    (``unretire``); un-retiring an already-active row is an idempotent no-op that records
    nothing. Returns the updated Exercise via the standard envelope in the same shape as
    ``GET /{id}``."""

    return _flip_retire(
        exercise_id,
        retire=False,
        operator=operator,
        exercises=exercises,
        relationships=relationships,
        audit=audit,
        images=images,
    )


def _flip_retire(
    exercise_id: int,
    *,
    retire: bool,
    operator: str,
    exercises: ExerciseRepository,
    relationships: ExerciseRelationshipRepository,
    audit: ExerciseAuditRepository,
    images: ExerciseImageRepository,
) -> dict:
    """Set (or clear) the Retire tombstone, audit the transition, and re-serialize (ADR-0076).

    The one body behind the retire and un-retire routes, so both resolve, flip, audit, and
    respond identically — only the target state and the recorded ``AuditAction`` differ. Audits
    only a real state change (mirroring the Provenance no-op rule), so re-affirming the current
    state records nothing and the append-only trail holds only genuine transitions."""

    existing = exercises.get(exercise_id)
    if existing is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    updated = exercises.retire(exercise_id) if retire else exercises.unretire(exercise_id)
    # ``existing`` was resolved above, so the write cannot miss; guard defensively anyway.
    if updated is None:  # pragma: no cover - unreachable after the resolve above
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    if existing.retired != updated.retired:
        # Audit only a real transition (ADR-0076): flipping to the current state writes no row.
        audit.record(
            exercise_id=exercise_id,
            actor=operator,
            action=AuditAction.RETIRE if retire else AuditAction.UNRETIRE,
            detail={},
        )
    related = relationships.substitutes_for(exercise_id)
    return success_envelope(
        _serialize(updated, related, has_image=images.exists(exercise_id))
    )


def _audit_record(record: AuditRecord) -> dict[str, object]:
    """One row of the admin audit trail, serialized for the ops read (ADR-0075/0076)."""

    return {
        "id": record.id,
        "actor": record.actor,
        "action": record.action,
        "detail": record.detail,
        "created_at": record.created_at.isoformat(),
    }


@router.get("/exercises/{exercise_id}/audit")
def read_exercise_audit(
    exercise_id: int,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    audit: ExerciseAuditRepository = Depends(get_exercise_audit_repository),
) -> dict:
    """Read one Catalog Exercise's append-only admin audit trail (issue #503, ADR-0075).

    Operator-only (``require_admin``, ADR-0046): the trail records who conferred or revoked
    trust, so it is an admin-only read. Returns the Exercise's recorded acts newest-first via
    the standard envelope; a missing Exercise is ``404`` and an Exercise with no acts yet is a
    ``200`` with an empty list. The trail is append-only — this route only reads it."""

    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    records = audit.list_for(exercise_id)
    return success_envelope([_audit_record(record) for record in records])


class RelationshipLinkBody(BaseModel):
    """The target + kind of one Variation/Alternative link to add or remove (issue #505).

    ``kind`` is typed as the ``RelationKind`` enum, so FastAPI rejects any value outside
    ``variation`` / ``alternative`` with a ``422`` before the handler runs. The ``from`` end
    of the link is the path Exercise; ``to_id`` names the other end. The self-link and
    duplicate guards live in the repository and surface as ``422`` / ``409`` below."""

    to_id: int
    kind: RelationKind


def _relationship_row(relationship: DirectedRelationship) -> dict:
    """One row of an Exercise's relationship list (issue #505): the *other* Exercise, the
    relationship kind, and which way the link points relative to the viewed Exercise."""

    return {
        "id": relationship.exercise.id,
        "name": relationship.exercise.name,
        "kind": relationship.kind.value,
        "direction": relationship.direction.value,
    }


@router.get("/exercises/{exercise_id}/relationships")
def list_exercise_relationships(
    exercise_id: int,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
) -> dict:
    """List one Catalog Exercise's typed relationships in **both** directions (issue #505).

    Operator-only (``require_admin``, ADR-0046). Returns every Variation/Alternative link
    touching this Exercise — outgoing (the linked movement is a kind-of this one) and incoming
    (this movement is a kind-of the linked one) — each row carrying the other Exercise, the
    kind, and the direction, so a curator sees the full local graph before editing it. These
    are the lookup-first candidates Substitution resolves over. A missing Exercise is ``404``;
    an Exercise with no links is a ``200`` with an empty list. Responses use the standard
    envelope."""

    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    listed = relationships.list_for(exercise_id)
    return success_envelope([_relationship_row(rel) for rel in listed])


@router.post("/exercises/{exercise_id}/relationships")
def add_exercise_relationship(
    exercise_id: int,
    payload: RelationshipLinkBody,
    response: Response,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
) -> dict:
    """Add one Variation/Alternative link from this Exercise to another (issue #505, spec §5).

    Operator-only (``require_admin``, ADR-0046). Records that ``to_id`` is a ``kind`` of the
    path Exercise — a single **directed** row; no reciprocal/inverse link is created, so the
    inverse (if wanted) is a separate deliberate add. Both endpoints of the link must exist —
    a missing path Exercise or a missing ``to_id`` is a ``404`` — so no dangling link enters
    the graph. A self-link (``to_id`` == path id) is a ``422`` and a duplicate ``(from, to,
    kind)`` is a ``409`` (the two guards that keep the graph clean, spec §4); an invalid kind
    is a ``422`` handled by the body model. On success returns ``201`` with the created link
    via the standard envelope."""

    from_exercise = exercises.get(exercise_id)
    if from_exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    if exercises.get(payload.to_id) is None:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Target exercise not found"
        )
    try:
        relationships.add(exercise_id, payload.to_id, payload.kind)
    except SelfLinkError as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail="An exercise cannot be a variation or alternative of itself.",
        ) from exc
    except DuplicateRelationshipError as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="That relationship already exists.",
        ) from exc
    response.status_code = HTTP_CREATED
    return success_envelope(
        {"from_id": exercise_id, "to_id": payload.to_id, "kind": payload.kind.value}
    )


@router.delete("/exercises/{exercise_id}/relationships")
def remove_exercise_relationship(
    exercise_id: int,
    payload: RelationshipLinkBody,
    _operator: str = Depends(require_admin),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
) -> Response:
    """Remove one Variation/Alternative link by ``(to_id, kind)`` (issue #505, spec §5).

    Operator-only (``require_admin``, ADR-0046). Deletes the single directed ``(from, to,
    kind)`` row from the path Exercise; the inverse direction (if any) is untouched. A missing
    path Exercise is a ``404``; otherwise the remove is idempotent — removing a link that does
    not exist still succeeds — and returns a bodyless ``204`` (spec §5, the one non-envelope
    write; the transport seam treats a 204 as success). An invalid kind is a ``422`` handled by
    the body model."""

    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    relationships.remove(exercise_id, payload.to_id, payload.kind)
    return Response(status_code=HTTP_NO_CONTENT)
