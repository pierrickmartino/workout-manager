"""Session generation routes: create a standalone Session from the AI, and read
one back.

``POST /api/sessions/generate`` runs the first end-to-end AI path (Slice 3) —
validated request in, schema-constrained generation, catalog resolution, and a
persisted user-owned Session out. A malformed generation is surfaced as a
``502`` (an upstream AI failure), never silently persisted. ``GET
/api/sessions/{id}`` returns the owner's Session, ``404`` for anyone else. All
responses use the standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.generation.generator import (
    GenerationError,
    GenerationRequest,
    SessionGenerator,
)
from app.generation.service import generate_session
from app.repositories.deps import (
    get_exercise_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import SessionRepository, SessionView

router = APIRouter(prefix="/api", tags=["sessions"])

HTTP_NOT_FOUND = 404
HTTP_BAD_GATEWAY = 502

MIN_DURATION_MINUTES = 1
MAX_DURATION_MINUTES = 360


class GenerateSessionRequest(BaseModel):
    """Validated request for a standalone Session generation."""

    training_type: str = Field(min_length=1)
    duration_minutes: int = Field(ge=MIN_DURATION_MINUTES, le=MAX_DURATION_MINUTES)
    equipment: list[str] = Field(default_factory=list)

    def to_generation_request(self) -> GenerationRequest:
        return GenerationRequest(
            training_type=self.training_type,
            duration_minutes=self.duration_minutes,
            equipment=self.equipment,
        )


def _serialize(view: SessionView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "duration_minutes": view.duration_minutes,
        "prescriptions": [
            {
                "position": p.position,
                "sets": p.sets,
                "reps": p.reps,
                "rest_seconds": p.rest_seconds,
                "tempo": p.tempo,
                "recommended_load": p.recommended_load,
                "exercise_id": p.exercise_id,
                "exercise_name": p.exercise_name,
                "exercise_description": p.exercise_description,
                "targeted_muscles": p.targeted_muscles,
                "required_equipment": p.required_equipment,
                "provenance": p.provenance,
            }
            for p in view.prescriptions
        ],
    }


@router.post("/sessions/generate")
def generate(
    payload: GenerateSessionRequest,
    clerk_user_id: str = Depends(get_current_user),
    generator: SessionGenerator = Depends(get_session_generator),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    try:
        view = generate_session(
            payload.to_generation_request(),
            clerk_user_id,
            generator=generator,
            exercises=exercises,
            sessions=sessions,
        )
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="The workout could not be generated. Please try again.",
        ) from exc
    return success_envelope(_serialize(view))


@router.get("/sessions/{session_id}")
def read_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(_serialize(view))
