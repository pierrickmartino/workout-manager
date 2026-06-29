"""Program routes: generate-and-adopt a multi-week Program, and read it back with
its self-paced position.

``POST /api/programs/generate`` runs the Slice 5 path — a validated full parameter
set in, a schema-constrained fully-enumerated generation, Adoption by deep copy,
and a persisted user-owned Program out. A malformed/under-enumerated generation is
surfaced as a ``502`` (an upstream AI failure), never silently persisted. ``GET
/api/programs/{id}`` returns the owner's Program joined to its *next un-performed
Session* (self-paced, no calendar), ``404`` for anyone else. All responses use the
standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.generation.generator import GenerationError
from app.generation.program_generator import (
    ProgramGenerationRequest,
    ProgramGenerator,
)
from app.generation.cache import GenerationCache
from app.generation.program_service import cache_request_for, generate_program
from app.programs.progress import ProgramProgressView, program_progress
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_cache,
    get_logged_session_repository,
    get_profile_repository,
    get_program_generator,
    get_program_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.program_repository import (
    ProgramRepository,
    ProgramSessionView,
    ProgramView,
)

router = APIRouter(prefix="/api", tags=["programs"])

HTTP_NOT_FOUND = 404
HTTP_BAD_GATEWAY = 502

MIN_SESSIONS_PER_WEEK = 1
MAX_SESSIONS_PER_WEEK = 14
MIN_WEEKS = 1
MAX_WEEKS = 52
MIN_DURATION_MINUTES = 1
MAX_DURATION_MINUTES = 360


class GenerateProgramRequest(BaseModel):
    """Validated request for a multi-week Program generation (full parameter set)."""

    training_type: str = Field(min_length=1)
    objective: str = Field(min_length=1)
    sessions_per_week: int = Field(
        ge=MIN_SESSIONS_PER_WEEK, le=MAX_SESSIONS_PER_WEEK
    )
    duration_minutes: int = Field(ge=MIN_DURATION_MINUTES, le=MAX_DURATION_MINUTES)
    weeks: int = Field(ge=MIN_WEEKS, le=MAX_WEEKS)
    equipment: list[str] = Field(default_factory=list)

    def to_generation_request(self) -> ProgramGenerationRequest:
        return ProgramGenerationRequest(
            training_type=self.training_type,
            objective=self.objective,
            sessions_per_week=self.sessions_per_week,
            duration_minutes=self.duration_minutes,
            weeks=self.weeks,
            equipment=self.equipment,
        )


def _serialize_session(session: ProgramSessionView) -> dict:
    return {
        "session_id": session.session_id,
        "position": session.position,
        "week": session.week,
        "day": session.day,
        "title": session.title,
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
            for p in session.prescriptions
        ],
    }


def _serialize_program(view: ProgramView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "objective": view.objective,
        "sessions_per_week": view.sessions_per_week,
        "weeks": view.weeks,
        "duration_minutes": view.duration_minutes,
        "sessions": [_serialize_session(s) for s in view.sessions],
    }


def _serialize_progress(progress: ProgramProgressView) -> dict:
    data = _serialize_program(progress.program)
    data["completed_count"] = progress.completed_count
    data["next_session"] = (
        _serialize_session(progress.next_session)
        if progress.next_session is not None
        else None
    )
    return data


@router.post("/programs/generate")
def generate(
    payload: GenerateProgramRequest,
    clerk_user_id: str = Depends(get_current_user),
    generator: ProgramGenerator = Depends(get_program_generator),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    programs: ProgramRepository = Depends(get_program_repository),
    cache: GenerationCache = Depends(get_generation_cache),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    params = payload.to_generation_request()
    profile = profiles.get_or_create(clerk_user_id)
    try:
        view = generate_program(
            params,
            clerk_user_id,
            cache=cache,
            cache_request=cache_request_for(params, profile),
            generator=generator,
            exercises=exercises,
            programs=programs,
        )
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="The program could not be generated. Please try again.",
        ) from exc
    return success_envelope(_serialize_program(view))


@router.get("/programs/{program_id}")
def read_program(
    program_id: int,
    clerk_user_id: str = Depends(get_current_user),
    programs: ProgramRepository = Depends(get_program_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    progress = program_progress(
        clerk_user_id, program_id, programs=programs, logged=logged
    )
    if progress is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Program not found")
    return success_envelope(_serialize_progress(progress))
