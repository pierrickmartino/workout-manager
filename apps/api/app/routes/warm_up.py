"""Warm-up Suggestion routes (ADR-0143).

``POST /api/sessions/{id}/warm-up-suggestion`` previews 4–6 AI warm-up drills for the
owner's Session, synchronously, under the standard envelope. It never changes the Session.
A Session the caller does not own is ``404``; malformed model output is ``502``.

``PUT /api/sessions/{id}/warm-up`` adds the previewed drills at the front of the owner's
un-performed Session — standalone or Protocol member — as one-set warm-up Prescriptions and
returns the updated Session. When the Session already opens with a Warm-up Section, the
drills replace exactly that leading run (ADR-0074, #782). Another user's Session is ``404``; a
performed one ``409``; a drill outside the catalog, or one not shaped as a drill, ``422``.
The request bodies live in ``app.routes.warm_up_body``."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.generation.llm.port import GenerationError
from app.generation.warm_up_cache import WarmUpCache
from app.generation.warm_up_generator import WarmUpGenerator
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
    get_warm_up_cache,
    get_warm_up_generator,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository
from app.routes.warm_up_body import ApplyWarmUpBody, WarmUpSuggestionBody
from app.session_serialization import serialize_session
from app.warm_up.apply import apply_warm_up
from app.warm_up.errors import SessionNotFound, SessionPerformed, UnknownDrillExercise
from app.warm_up.service import SuggestedDrill, WarmUpSuggestion, suggest_warm_up

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422
HTTP_BAD_GATEWAY = 502

router = APIRouter(prefix="/api", tags=["warm-up"])


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


@router.put("/sessions/{session_id}/warm-up")
def apply_warm_up_to_session(
    session_id: int,
    body: ApplyWarmUpBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    try:
        view = apply_warm_up(
            session_id,
            clerk_user_id,
            [drill.to_drill() for drill in body.drills],
            sessions=sessions,
            logged=logged,
            exercises=exercises,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found") from exc
    except SessionPerformed as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A warm-up can't be added to a session you have already trained.",
        ) from exc
    except UnknownDrillExercise as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail=f"Unknown exercise {exc.exercise_id}",
        ) from exc
    return success_envelope(serialize_session(view))
