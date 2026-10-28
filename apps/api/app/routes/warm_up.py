"""Warm-up Suggestion routes (ADR-0143).

``POST /api/sessions/{id}/warm-up-suggestion`` previews 4–6 AI warm-up drills for the
owner's Session, synchronously, under the standard envelope. It never changes the Session.
A Session the caller does not own is ``404``; malformed model output is ``502``.

``PUT /api/sessions/{id}/warm-up`` adds the previewed drills at the front of the owner's
un-performed Session — standalone or Protocol member — as one-set warm-up Prescriptions and
returns the updated Session. Another user's Session is ``404``; a performed one ``409``; a
drill outside the catalog, or one not shaped as a drill, ``422``."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.auth.dependencies import get_current_user
from app.domain.load import LoadKind
from app.domain.quantity import QuantityKind
from app.domain.warm_up import MAX_DRILL_REST_SECONDS, MAX_DRILLS
from app.envelope import success_envelope
from app.generation.llm.port import GenerationError
from app.generation.schema import MAX_DRILL_AMOUNT
from app.generation.warm_up_generator import WarmUpGenerator
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
    get_warm_up_generator,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository
from app.session_serialization import serialize_session
from app.warm_up.apply import (
    SessionPerformed,
    UnknownDrillExercise,
    WarmUpDrill,
    apply_warm_up,
)
from app.warm_up.service import (
    SessionNotFound,
    SuggestedDrill,
    WarmUpSuggestion,
    suggest_warm_up,
)

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422
HTTP_BAD_GATEWAY = 502

router = APIRouter(prefix="/api", tags=["warm-up"])


class WarmUpSuggestionBody(BaseModel):
    """``regenerate`` asks for a fresh suggestion. Every suggestion is generated fresh until
    the cache lands (#781), when it will skip the cache read."""

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
) -> dict:
    try:
        suggestion = suggest_warm_up(
            session_id,
            clerk_user_id,
            sessions=sessions,
            profiles=profiles,
            exercises=exercises,
            generator=generator,
        )
    except SessionNotFound as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found") from exc
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="No warm-up could be suggested. Please try again.",
        ) from exc
    return success_envelope(_serialize(suggestion))


class DrillQuantityBody(BaseModel):
    """A drill's Prescribed Quantity as the preview returned it: reps or seconds."""

    kind: Literal["repetitions", "duration"]
    count: int | None = Field(default=None, ge=1, le=MAX_DRILL_AMOUNT)
    seconds: float | None = Field(default=None, gt=0, le=MAX_DRILL_AMOUNT)

    @model_validator(mode="after")
    def _carries_its_amount(self) -> "DrillQuantityBody":
        if self.amount is None:
            raise ValueError(f"a {self.kind} quantity needs its amount")
        return self

    @property
    def amount(self) -> int | None:
        value = self.count if self.kind == QuantityKind.REPETITIONS.value else self.seconds
        return None if value is None else int(value)


class DrillLoadBody(BaseModel):
    """A drill's Load: bodyweight or a named qualitative Load — never kg."""

    kind: Literal["bodyweight", "qualitative"]
    text: str | None = None

    @model_validator(mode="after")
    def _qualitative_load_names_itself(self) -> "DrillLoadBody":
        if self.kind == LoadKind.QUALITATIVE.value and not (self.text or "").strip():
            raise ValueError("a qualitative load needs its text")
        return self


class ApplyDrillBody(BaseModel):
    """One drill to add, in the shape the suggestion preview returns it. Its name, sets,
    reps line and Set Type are not read: every drill becomes one ``warm_up`` set whose reps
    line is derived from its Quantity."""

    exercise_id: int
    prescribed_quantity: DrillQuantityBody
    recommended_load: DrillLoadBody
    rest_seconds: int = Field(ge=0, le=MAX_DRILL_REST_SECONDS)

    def to_drill(self) -> WarmUpDrill:
        return WarmUpDrill(
            exercise_id=self.exercise_id,
            quantity_kind=QuantityKind(self.prescribed_quantity.kind),
            amount=self.prescribed_quantity.amount or 0,
            load_kind=LoadKind(self.recommended_load.kind),
            load_text=self.recommended_load.text,
            rest_seconds=self.rest_seconds,
        )


class ApplyWarmUpBody(BaseModel):
    drills: list[ApplyDrillBody] = Field(min_length=1, max_length=MAX_DRILLS)


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
