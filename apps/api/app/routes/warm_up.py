"""Warm-up Suggestion route (ADR-0143).

``POST /api/sessions/{id}/warm-up-suggestion`` previews 4–6 AI warm-up drills for the
owner's Session, synchronously, under the standard envelope. It never changes the Session.
A Session the caller does not own is ``404``; malformed model output is ``502``."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.generation.llm.port import GenerationError
from app.generation.warm_up_cache import WarmUpCache
from app.generation.warm_up_generator import WarmUpGenerator
from app.repositories.deps import (
    get_exercise_repository,
    get_profile_repository,
    get_session_repository,
    get_warm_up_cache,
    get_warm_up_generator,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository
from app.warm_up.service import (
    SessionNotFound,
    SuggestedDrill,
    WarmUpSuggestion,
    suggest_warm_up,
)

HTTP_NOT_FOUND = 404
HTTP_BAD_GATEWAY = 502

router = APIRouter(prefix="/api", tags=["warm-up"])


class WarmUpSuggestionBody(BaseModel):
    """``regenerate`` asks for a fresh suggestion: it skips the cache read (ADR-0003)."""

    regenerate: bool = False


def _serialize_drill(drill: SuggestedDrill) -> dict:
    return {
        "exercise_id": drill.exercise_id,
        "exercise_name": drill.exercise_name,
        "sets": drill.sets,
        "reps": drill.reps,
        "prescribed_quantity": drill.prescribed_quantity,
        "recommended_load": drill.recommended_load,
        "rest_seconds": drill.rest_seconds,
        "set_type": drill.set_type,
    }


def _serialize(suggestion: WarmUpSuggestion) -> dict:
    return {
        "drills": [_serialize_drill(drill) for drill in suggestion.drills],
        "estimated_minutes": suggestion.estimated_minutes,
        "has_warm_up_section": suggestion.has_warm_up_section,
    }


@router.post("/sessions/{session_id}/warm-up-suggestion")
def warm_up_suggestion(
    session_id: int,
    body: WarmUpSuggestionBody | None = Body(default=None),
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    generator: WarmUpGenerator = Depends(get_warm_up_generator),
    cache: WarmUpCache = Depends(get_warm_up_cache),
) -> dict:
    try:
        suggestion = suggest_warm_up(
            session_id,
            clerk_user_id,
            sessions=sessions,
            profiles=profiles,
            exercises=exercises,
            generator=generator,
            cache=cache,
            regenerate=body.regenerate if body is not None else False,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found") from exc
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="No warm-up could be suggested. Please try again.",
        ) from exc
    return success_envelope(_serialize(suggestion))
