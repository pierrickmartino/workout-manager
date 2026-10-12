"""Curated Protocol routes (issue #684, ADR-0130).

``GET /api/curated-protocols`` lists the released Curated Protocols, each main lift carrying the
starting weight prefilled for the requesting user (issue #686): a fraction of their Estimated
1RM, or the conservative default, computed at read time from their Logged Sessions, and whether
the Sensitive Constraint caveat applies to them (issue #687). ``POST
/api/curated-protocols/{identifier}/adopt`` validates the user's length and starting weights,
recomputes the whole plan server-side, and persists it as the user's Current Protocol, or set
aside for a user with a Sensitive Constraint (ADR-0130, ADR-0058). ``POST
/api/curated-protocols/{identifier}/preview`` (issue #685) takes the same choices through the
same validation and the same ``enumerate_plan``, and returns the plan without persisting
anything, so what was previewed is what adopt writes. An unreleased Curated Protocol is a
``404``, exactly like an unknown one. Rejected choices are a ``422`` naming every problem, and
persist nothing. Every response uses the standard envelope."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.adoption.curated import CuratedExerciseMissing, adopt_curated
from app.auth.dependencies import get_current_user
from app.curated.model import CuratedProtocol
from app.curated.plan import (
    AdoptionChoices,
    ChoiceError,
    PlannedSession,
    enumerate_plan,
    validate_choices,
)
from app.curated.prefill import StartingWeightPrefill, starting_weight_prefills
from app.curated.registry import CuratedRegistry, get_curated_registry
from app.domain.fitness_profile import is_sensitive
from app.envelope import error_envelope, success_envelope
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)
from app.repositories.profile_repository import ProfileRepository
from app.repositories.protocol_repository import ProtocolRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["curated-protocols"])

HTTP_CREATED = 201
HTTP_NOT_FOUND = 404
HTTP_UNPROCESSABLE_ENTITY = 422
HTTP_INTERNAL_SERVER_ERROR = 500


class AdoptCuratedProtocolRequest(BaseModel):
    """The user's choices, for adopt and preview alike. The bounds belong to the Curated
    Protocol, so they are checked once it is known (``validate_choices``), not here."""

    weeks: int
    starting_weights_kg: dict[str, float]


def _serialize_prefill(prefill: StartingWeightPrefill) -> dict:
    return {"kg": prefill.kg, "source": prefill.source}


def _serialize_curated(
    curated: CuratedProtocol, history: list[LoggedSessionView], *, caveat: bool
) -> dict:
    prefills = starting_weight_prefills(curated, history)
    return {
        "identifier": curated.identifier,
        "version": curated.version,
        "name": curated.name,
        "description": curated.description,
        "training_type": curated.training_type,
        "sessions_per_week": curated.sessions_per_week,
        "min_weeks": curated.min_weeks,
        "max_weeks": curated.max_weeks,
        "required_equipment": list(curated.required_equipment),
        "main_lifts": [
            {
                "key": lift.key,
                "exercise_name": lift.exercise,
                "default_starting_weight_kg": lift.default_start_kg,
                "starting_weight_prefill": _serialize_prefill(prefills[lift.key]),
            }
            for lift in curated.main_lifts
        ],
        # Whether the "not tailored to your constraints" caveat applies to this user (ADR-0058):
        # true exactly when they hold a Sensitive Constraint, so adopting will set it aside.
        "sensitive_constraint_caveat": caveat,
    }


def _untailored_for(clerk_user_id: str, profiles: ProfileRepository) -> bool:
    """Whether a Curated Protocol is untailored *for this user*: they hold a Sensitive
    Constraint, so the list shows the caveat and adopt sets the copy aside (ADR-0058). One
    rule, read the same way by both, so the caveat shown is the posture applied."""

    return is_sensitive(profiles.get_or_create(clerk_user_id))


@router.get("/curated-protocols")
def list_curated_protocols(
    clerk_user_id: str = Depends(get_current_user),
    registry: CuratedRegistry = Depends(get_curated_registry),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    """The released Curated Protocols, in authored order, with each main lift's starting
    weight prefilled from the user's own records, and whether the Sensitive Constraint
    caveat applies to this user."""

    released = registry.released()
    if not released:
        return success_envelope([])
    history = logged.list_for_user(clerk_user_id)
    caveat = _untailored_for(clerk_user_id, profiles)
    return success_envelope(
        [_serialize_curated(p, history, caveat=caveat) for p in released]
    )


def _choice_error_response(errors: list[ChoiceError]) -> JSONResponse:
    body = {
        **error_envelope(errors[0].message),
        "errors": [
            {"code": e.code, "message": e.message, "main_lift": e.main_lift}
            for e in errors
        ],
    }
    return JSONResponse(status_code=HTTP_UNPROCESSABLE_ENTITY, content=body)


def _checked_choices(
    identifier: str,
    payload: AdoptCuratedProtocolRequest,
    registry: CuratedRegistry,
) -> tuple[CuratedProtocol, AdoptionChoices] | JSONResponse:
    """The released Curated Protocol and the user's validated choices, or the ``422`` naming
    every problem. Adopt and preview both pass through here, so they reject alike."""

    curated = registry.find_released(identifier)
    if curated is None:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Curated Protocol not found."
        )

    choices = AdoptionChoices(
        weeks=payload.weeks, starting_weights_kg=payload.starting_weights_kg
    )
    errors = validate_choices(curated, choices)
    if errors:
        return _choice_error_response(errors)
    return curated, choices


def _serialize_planned_session(session: PlannedSession) -> dict:
    return {
        "week": session.week,
        "day": session.day,
        "title": session.title,
        "prescriptions": [
            {
                "exercise_name": p.exercise,
                "sets": p.sets,
                "reps": p.reps,
                "rest_seconds": p.rest_seconds,
                "recommended_load": p.recommended_load,
                "prescribed_quantity": p.prescribed_quantity,
                "scheme": p.scheme,
            }
            for p in session.prescriptions
        ],
    }


@router.post("/curated-protocols/{identifier}/preview")
def preview_curated_protocol(
    identifier: str,
    payload: AdoptCuratedProtocolRequest,
    _clerk_user_id: str = Depends(get_current_user),
    registry: CuratedRegistry = Depends(get_curated_registry),
) -> object:
    """The fully enumerated plan adopting with these choices would write. Persists nothing,
    reads no repository and never calls the LLM: it is the pure ``enumerate_plan`` adopt
    persists, so the Loads shown are the Loads adopted."""

    checked = _checked_choices(identifier, payload, registry)
    if isinstance(checked, JSONResponse):
        return checked
    curated, choices = checked
    return success_envelope(
        {
            "identifier": curated.identifier,
            "version": curated.version,
            "weeks": choices.weeks,
            "sessions_per_week": curated.sessions_per_week,
            "sessions": [
                _serialize_planned_session(session)
                for session in enumerate_plan(curated, choices)
            ],
        }
    )


@router.post("/curated-protocols/{identifier}/adopt", status_code=HTTP_CREATED)
def adopt_curated_protocol(
    identifier: str,
    payload: AdoptCuratedProtocolRequest,
    clerk_user_id: str = Depends(get_current_user),
    registry: CuratedRegistry = Depends(get_curated_registry),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> object:
    """Adopt a released Curated Protocol as the user's own Protocol: Current, or set aside
    for a user with a Sensitive Constraint (ADR-0130, ADR-0058), which the response says."""

    checked = _checked_choices(identifier, payload, registry)
    if isinstance(checked, JSONResponse):
        return checked
    curated, choices = checked
    set_aside = _untailored_for(clerk_user_id, profiles)

    try:
        protocol = adopt_curated(
            curated,
            choices,
            clerk_user_id,
            set_aside=set_aside,
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
    return success_envelope({"protocol_id": protocol.id, "set_aside": set_aside})
