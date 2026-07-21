"""Session generation routes: create a standalone Session from the AI, and read
one back.

``POST /api/sessions/generate`` runs the first end-to-end AI path (Slice 3) —
validated request in, schema-constrained generation, catalog resolution, and a
persisted user-owned Session out. A malformed generation is surfaced as a
``502`` (an upstream AI failure), never silently persisted. ``GET
/api/sessions/{id}`` returns the owner's Session, ``404`` for anyone else. All
responses use the standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.domain.feedback import parse_verdict
from app.domain.fitness_profile import is_sensitive
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
from app.generation.substitute_generator import SubstituteGenerator
from app.live.hydration import hydrate_session
from app.live.serialization import serialize_hydrated_session
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_generation_feedback_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_regenerator,
    get_session_repository,
    get_substitute_generator,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
    GenerationFeedbackView,
)
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository, SessionView
from app.substitution.service import (
    HarderVariationSuggestion,
    PrescriptionNotFound,
    SubstituteNotAvailable,
    harder_variation_suggestion,
    substitute_exercise,
)
from app.substitution.service import SessionNotFound as SubstituteSessionNotFound

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

    def to_generation_request(
        self, *, has_sensitive_constraint: bool = False
    ) -> GenerationRequest:
        return GenerationRequest(
            training_type=self.training_type,
            duration_minutes=self.duration_minutes,
            equipment=self.equipment,
            has_sensitive_constraint=has_sensitive_constraint,
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
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    # A user with any Sensitive Constraint is never handed a Superset (ADR-0023): the
    # flag rides on the generation request so the prompt instructs none and the parse
    # boundary degrades any that slip through. Derived from stored constraint types.
    profile = profiles.get_or_create(clerk_user_id)
    try:
        view = generate_session(
            payload.to_generation_request(
                has_sensitive_constraint=is_sensitive(profile)
            ),
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


@router.get("/sessions/{session_id}/live")
def hydrate_live_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """Return the owner's Session hydrated for the live screen (issue #90).

    The recommended loads carry the ADR-0004 Progression adjustment and each
    Exercise carries its previous performance to beat. ``404`` for anyone who does
    not own the Session, so non-owners never seed a Live Session.
    """

    view = hydrate_session(clerk_user_id, session_id, sessions=sessions, logged=logged)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(serialize_hydrated_session(view))


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


class SubstituteBody(BaseModel):
    """The optional accept payload for a Substitution. ``target_exercise_id`` names a
    specific catalog Variation/Alternative to advance to — e.g. accepting the
    harder-Variation offer at the rep ceiling (#202). Omitted, the swap resolves
    automatically, lookup-first."""

    target_exercise_id: int | None = None


@router.post("/sessions/{session_id}/prescriptions/{position}/substitute")
def substitute(
    session_id: int,
    position: int,
    body: SubstituteBody | None = Body(default=None),
    clerk_user_id: str = Depends(get_current_user),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    generator: SubstituteGenerator = Depends(get_substitute_generator),
) -> dict:
    target_exercise_id = body.target_exercise_id if body is not None else None
    try:
        view = substitute_exercise(
            session_id,
            clerk_user_id,
            position,
            target_exercise_id=target_exercise_id,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=generator,
        )
    except (SubstituteSessionNotFound, PrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    except SubstituteNotAvailable as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="That substitute is not available for this prescription.",
        ) from exc
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="No substitute could be found. Please try again.",
        ) from exc
    return success_envelope(_serialize(view))


def _serialize_suggestion(suggestion: HarderVariationSuggestion | None) -> dict:
    """The harder-Variation offer, or ``null`` when the prescription holds. The
    ``exercise_id`` is what the client POSTs back as ``target_exercise_id`` to accept.
    """

    return {
        "suggested_variation": (
            {"exercise_id": suggestion.exercise_id, "name": suggestion.name}
            if suggestion is not None
            else None
        )
    }


@router.get("/sessions/{session_id}/prescriptions/{position}/harder-variation")
def read_harder_variation(
    session_id: int,
    position: int,
    clerk_user_id: str = Depends(get_current_user),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    """Offer the next harder Variation when this pure-bodyweight Prescription has hit
    its rep ceiling (#202), else ``null``. Read-only; accepting is a POST to
    ``/substitute`` with the returned ``exercise_id`` as ``target_exercise_id``."""

    try:
        suggestion = harder_variation_suggestion(
            session_id,
            clerk_user_id,
            position,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            logged=logged,
            profiles=profiles,
        )
    except (SubstituteSessionNotFound, PrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    return success_envelope(_serialize_suggestion(suggestion))
