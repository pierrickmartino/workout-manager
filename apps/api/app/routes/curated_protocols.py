"""Curated Protocol routes (issue #684, ADR-0130).

``GET /api/curated-protocols`` lists the released Curated Protocols. ``POST
/api/curated-protocols/{identifier}/adopt`` validates the user's length and starting weights,
recomputes the whole plan server-side, and persists it as the user's Current Protocol. An
unreleased program is a ``404``, exactly like an unknown one. Rejected choices are a ``422``
naming every problem, and persist nothing. Every response uses the standard envelope."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.adoption.curated import CuratedExerciseMissing, adopt_curated
from app.auth.dependencies import get_current_user
from app.curated.model import CuratedProtocol
from app.curated.plan import AdoptionChoices, ChoiceError, validate_choices
from app.curated.registry import CuratedRegistry, get_curated_registry
from app.envelope import error_envelope, success_envelope
from app.repositories.deps import get_exercise_repository, get_protocol_repository
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.protocol_repository import ProtocolRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["curated-protocols"])

HTTP_CREATED = 201
HTTP_NOT_FOUND = 404
HTTP_UNPROCESSABLE_ENTITY = 422
HTTP_INTERNAL_SERVER_ERROR = 500


class AdoptCuratedProtocolRequest(BaseModel):
    """The user's choices. Bounds are the program's, so they are checked after the program
    is known (``validate_choices``), not here."""

    weeks: int
    starting_weights_kg: dict[str, float]


def _serialize_program(program: CuratedProtocol) -> dict:
    return {
        "identifier": program.identifier,
        "version": program.version,
        "name": program.name,
        "description": program.description,
        "training_type": program.training_type,
        "sessions_per_week": program.sessions_per_week,
        "min_weeks": program.min_weeks,
        "max_weeks": program.max_weeks,
        "required_equipment": list(program.required_equipment),
        "main_lifts": [
            {
                "key": lift.key,
                "exercise_name": lift.exercise,
                "default_starting_weight_kg": lift.default_start_kg,
            }
            for lift in program.main_lifts
        ],
    }


@router.get("/curated-protocols")
def list_curated_protocols(
    _clerk_user_id: str = Depends(get_current_user),
    registry: CuratedRegistry = Depends(get_curated_registry),
) -> dict:
    """The released Curated Protocols, in authored order."""

    return success_envelope([_serialize_program(p) for p in registry.released()])


def _choice_error_response(errors: list[ChoiceError]) -> JSONResponse:
    body = error_envelope(errors[0].message)
    body["errors"] = [
        {"code": e.code, "message": e.message, "main_lift": e.main_lift}
        for e in errors
    ]
    return JSONResponse(status_code=HTTP_UNPROCESSABLE_ENTITY, content=body)


@router.post("/curated-protocols/{identifier}/adopt", status_code=HTTP_CREATED)
def adopt_curated_protocol(
    identifier: str,
    payload: AdoptCuratedProtocolRequest,
    clerk_user_id: str = Depends(get_current_user),
    registry: CuratedRegistry = Depends(get_curated_registry),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
) -> object:
    """Adopt a released Curated Protocol as the user's own, Current Protocol."""

    program = registry.find_released(identifier)
    if program is None:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Curated Protocol not found."
        )

    choices = AdoptionChoices(
        weeks=payload.weeks, starting_weights_kg=payload.starting_weights_kg
    )
    errors = validate_choices(program, choices)
    if errors:
        return _choice_error_response(errors)

    try:
        protocol = adopt_curated(
            program,
            choices,
            clerk_user_id,
            exercises=exercises,
            protocols=protocols,
        )
    except CuratedExerciseMissing:
        # A seeding fault, not a user error: the content-integrity test should make it
        # unreachable, so it is logged loudly and nothing is persisted.
        logger.exception("Curated Protocol %s names an unseeded Exercise", identifier)
        return JSONResponse(
            status_code=HTTP_INTERNAL_SERVER_ERROR,
            content=error_envelope("This Curated Protocol can’t be adopted right now."),
        )
    return success_envelope({"protocol_id": protocol.id})
