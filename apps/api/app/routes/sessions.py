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
from app.domain.feedback import parse_verdict
from app.envelope import success_envelope
from app.generation.generator import (
    GenerationError,
    GenerationRequest,
    SessionGenerator,
)
from app.generation.regeneration_service import (
    RegenerationNotAllowed,
    RegenerationRequiresNegativeFeedback,
    SessionNotFound,
    regenerate_session,
)
from app.generation.regenerator import SessionRegenerator
from app.generation.service import generate_session
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_feedback_repository,
    get_session_generator,
    get_session_regenerator,
    get_session_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
    GenerationFeedbackView,
)
from app.repositories.session_repository import SessionRepository, SessionView

router = APIRouter(prefix="/api", tags=["sessions"])

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422
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
        "has_been_regenerated": view.has_been_regenerated,
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


class FeedbackRequest(BaseModel):
    """A Generation Feedback verdict on a Session, with an optional reason."""

    verdict: str = Field(min_length=1)
    reason: str | None = Field(default=None)


def _serialize_feedback(view: GenerationFeedbackView) -> dict:
    return {
        "id": view.id,
        "session_id": view.session_id,
        "verdict": view.verdict,
        "reason": view.reason,
    }


@router.post("/sessions/{session_id}/feedback")
def record_feedback(
    session_id: int,
    payload: FeedbackRequest,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    feedback: GenerationFeedbackRepository = Depends(
        get_generation_feedback_repository
    ),
) -> dict:
    try:
        verdict = parse_verdict(payload.verdict)
    except ValueError as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail="verdict must be 'positive' or 'negative'.",
        ) from exc

    # Feedback is recorded only on the user's own Session.
    if sessions.get(session_id, clerk_user_id) is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")

    view = feedback.record(
        clerk_user_id,
        session_id=session_id,
        verdict=verdict,
        reason=payload.reason,
    )
    return success_envelope(_serialize_feedback(view))


class RegenerateRequest(BaseModel):
    """Which Exercise Prescriptions to keep (0-based positions); the AI replaces
    the rest, steered by the Session's stored negative-feedback reason."""

    keep: list[int] = Field(default_factory=list)


@router.post("/sessions/{session_id}/regenerate")
def regenerate(
    session_id: int,
    payload: RegenerateRequest,
    clerk_user_id: str = Depends(get_current_user),
    regenerator: SessionRegenerator = Depends(get_session_regenerator),
    feedback: GenerationFeedbackRepository = Depends(
        get_generation_feedback_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    try:
        view = regenerate_session(
            session_id,
            clerk_user_id,
            payload.keep,
            regenerator=regenerator,
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )
    except SessionNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    except RegenerationNotAllowed as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="This Session has already been regenerated.",
        ) from exc
    except RegenerationRequiresNegativeFeedback as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="Leave negative feedback before regenerating this Session.",
        ) from exc
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="The Session could not be regenerated. Please try again.",
        ) from exc
    return success_envelope(_serialize(view))
