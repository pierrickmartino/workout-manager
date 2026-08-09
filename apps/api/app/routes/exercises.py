"""Exercise catalog routes: read one Exercise's enriched detail.

``GET /api/exercises/{id}`` returns the shared catalog Exercise — its description,
execution instructions, targeted muscles, difficulty, required equipment, and
precautions — together with its typed relationships split into Variations and
Alternatives (Slice 11). The catalog is global, but the endpoint requires
authentication like the rest of the API. Responses use the standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from app.auth.dependencies import get_current_user
from app.db.models import Exercise
from app.domain.exercise import Provenance, normalize_name
from app.domain.substitution import RelationKind
from app.envelope import success_envelope
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
)
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
    RelatedExercise,
)
from app.repositories.exercise_repository import ExerciseRepository

router = APIRouter(prefix="/api", tags=["exercises"])

HTTP_NOT_FOUND = 404

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
    Session view and Exercise Detail do (ADR-0021)."""

    return {
        "id": exercise.id,
        "name": exercise.name,
        "targeted_muscles": list(exercise.targeted_muscles),
        "required_equipment": list(exercise.required_equipment),
        "difficulty": exercise.difficulty,
        "provenance": exercise.provenance,
    }


@router.get("/exercises")
def search_exercises(
    query: str = Query(default="", description="Name substring to match."),
    limit: int = Query(default=DEFAULT_SEARCH_LIMIT, ge=1, le=MAX_SEARCH_LIMIT),
    offset: int = Query(default=0, ge=0),
    _: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """Search the shared catalog by normalized name for the Exercise Library.

    Returns each match's id, name, targeted muscles, required equipment, difficulty,
    and provenance — ranked curated-first then by name and paginated. Pick-only: a
    query with no match returns an empty result and never creates a catalog
    Exercise (ADR-0002/0021). Responses use the standard envelope with pagination
    meta."""

    page = exercises.search(query, limit=limit, offset=offset)
    return success_envelope(
        [_search_result(exercise) for exercise in page.items],
        meta={"total": page.total, "limit": limit, "offset": offset},
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
) -> dict:
    """Resolve ``name`` to a catalog Exercise, creating a ``user_entered`` one on a miss.

    Dedup is by normalized name (ADR-0002), so an existing entry — curated, AI, or a
    prior user-entered one — is returned as-is with its Provenance untouched; only a
    genuine miss mints a new, name-only ``user_entered`` movement. This is the sole
    place a user's typed movement enters the catalog; the log write stays id-only and
    never mints (ADR-0031/0033). Responses use the standard envelope."""

    exercise = exercises.find_or_create(
        payload.name, provenance=Provenance.USER_ENTERED
    )
    return success_envelope(_search_result(exercise))


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
