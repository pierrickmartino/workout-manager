"""Exercise catalog routes: read one Exercise's enriched detail.

``GET /api/exercises/{id}`` returns the shared catalog Exercise — its description,
execution instructions, targeted muscles, difficulty, required equipment, and
precautions — together with its typed relationships split into Variations and
Alternatives (Slice 11). The catalog is global, but the endpoint requires
authentication like the rest of the API. Responses use the standard envelope."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, field_validator

from app.auth.dependencies import get_current_user, require_admin
from app.db.models import Exercise
from app.domain.exercise import Provenance, catalog_completeness, normalize_name
from app.domain.exercise_browse import (
    distinct_equipment,
    parse_difficulty_band,
    parse_muscle_group,
)
from app.domain.exercise_usage import last_performed
from app.domain.substitution import RelationKind
from app.envelope import success_envelope
from app.generation.backfill_queue import BackfillQueue
from app.generation.enrichment_queue import EnrichmentQueue
from app.repositories.deps import (
    get_backfill_queue,
    get_enrichment_queue,
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_logged_session_repository,
)
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
    RelatedExercise,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["exercises"])

HTTP_NOT_FOUND = 404
HTTP_ACCEPTED = 202

# The Exercise Library page bounds: a sensible default page and a cap so one search
# never returns an unbounded slice of the catalog.
DEFAULT_SEARCH_LIMIT = 20
MAX_SEARCH_LIMIT = 50

# The sane upper bound on a user-typed movement name: long enough for any real
# movement, short enough to reject a junk paste before it enters the shared catalog.
MAX_NAME_LENGTH = 100


def _search_result(exercise: Exercise) -> dict:
    """The pick-only Library projection of a catalog Exercise: just enough to choose
    a movement and know if it is unvalidated. Provenance is surfaced exactly as the
    Session view and Exercise Detail do (ADR-0021), alongside the Catalog
    Completeness tier (content presence) as a separate axis (ADR-0041)."""

    return {
        "id": exercise.id,
        "name": exercise.name,
        "targeted_muscles": list(exercise.targeted_muscles),
        "required_equipment": list(exercise.required_equipment),
        "difficulty": exercise.difficulty,
        "provenance": exercise.provenance,
        # Catalog Completeness (ADR-0041): a read-time projection of which content
        # fields are populated — Stub | Listable | Enriched — never a stored column.
        # A distinct axis from Provenance/trust, shown beside it in the Library.
        "completeness": catalog_completeness(exercise).value,
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


def _summary(related: RelatedExercise) -> dict:
    return {"id": related.exercise.id, "name": related.exercise.name}


def _serialize(exercise: Exercise, related: list[RelatedExercise]) -> dict:
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
        # The optional Exercise Image (ADR-0041): a curated-source illustration
        # reference, ``null`` when the movement carries none. Its absence never
        # degrades the Detail response — a movement with no picture is still
        # fully usable.
        "image": exercise.image,
        # Catalog Completeness (ADR-0041): the read-time Stub | Listable | Enriched
        # tier, computed provenance-blind from the fields above, surfaced beside the
        # Provenance/trust marker on Exercise Detail. Never a stored column.
        "completeness": catalog_completeness(exercise).value,
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
) -> dict:
    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    related = relationships.substitutes_for(exercise_id)
    return success_envelope(_serialize(exercise, related))
