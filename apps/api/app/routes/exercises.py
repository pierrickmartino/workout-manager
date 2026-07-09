"""Exercise catalog routes: read one Exercise's enriched detail.

``GET /api/exercises/{id}`` returns the shared catalog Exercise — its description,
execution instructions, targeted muscles, difficulty, required equipment, and
precautions — together with its typed relationships split into Variations and
Alternatives (Slice 11). The catalog is global, but the endpoint requires
authentication like the rest of the API. Responses use the standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import get_current_user
from app.db.models import Exercise
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
