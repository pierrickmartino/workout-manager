"""Equipment Substitution routes (ADR-0143, #791).

``POST /api/sessions/{id}/equipment-substitution/preview`` lists the owner's Session's
Exercise Prescriptions that the stated Available Equipment blocks, each with its catalog
substitute or a needs-generation marker — no AI call, nothing written.

``POST /api/sessions/{id}/equipment-substitution`` substitutes the selected blocked
positions, each independently, and returns the updated Session plus a per-position outcome.
A position that is out of range or not blocked is ``422`` before anything runs.

Both answer under the standard envelope: ``404`` for a missing or unowned Session, ``409``
on a performed Protocol Session. ``available_equipment`` omitted inherits the Default
Equipment; an empty list is bodyweight only (ADR-0038); each value is a curated Equipment
token (ADR-0077). The Fitness Profile is never written."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.domain.equipment import Equipment
from app.envelope import success_envelope
from app.generation.substitute_generator import SubstituteGenerator
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
    get_substitute_generator,
)
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository
from app.session_serialization import serialize_session
from app.substitution.equipment_substitution import (
    BlockedPrescription,
    PositionOutcome,
    PositionsNotBlocked,
    apply_equipment_substitution,
    preview_equipment_substitution,
)
from app.substitution.service import SessionNotFound, SessionPerformed

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422

router = APIRouter(prefix="/api", tags=["sessions"])


class PreviewBody(BaseModel):
    """The equipment the user has for this action; omitted inherits the Default Equipment."""

    available_equipment: list[Equipment] | None = None

    def equipment_values(self) -> list[str] | None:
        if self.available_equipment is None:
            return None
        return [item.value for item in self.available_equipment]


class ApplyBody(PreviewBody):
    """The equipment plus the blocked positions the user kept selected (at least one, unique)."""

    positions: list[int] = Field(min_length=1)


def _serialize_row(row: BlockedPrescription) -> dict:
    return {
        "position": row.position,
        "exercise_id": row.exercise_id,
        "exercise_name": row.exercise_name,
        "substitute": (
            None
            if row.substitute is None
            else {
                "exercise_id": row.substitute.exercise_id,
                "name": row.substitute.name,
            }
        ),
        "needs_generation": row.needs_generation,
    }


def _serialize_outcome(outcome: PositionOutcome) -> dict:
    return {
        "position": outcome.position,
        "status": outcome.status.value,
        "source": None if outcome.source is None else outcome.source.value,
        "reason": outcome.reason,
    }


def _not_found() -> HTTPException:
    return HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")


def _performed() -> HTTPException:
    return HTTPException(
        status_code=HTTP_CONFLICT,
        detail="A performed Protocol Session can’t be changed.",
    )


@router.post("/sessions/{session_id}/equipment-substitution/preview")
def preview(
    session_id: int,
    body: PreviewBody | None = Body(default=None),
    clerk_user_id: str = Depends(get_current_user),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    sessions: SessionRepository = Depends(get_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    try:
        rows = preview_equipment_substitution(
            session_id,
            clerk_user_id,
            available_equipment=body.equipment_values() if body else None,
            relationships=relationships,
            sessions=sessions,
            profiles=profiles,
            logged=logged,
        )
    except SessionNotFound as exc:
        raise _not_found() from exc
    except SessionPerformed as exc:
        raise _performed() from exc
    return success_envelope({"rows": [_serialize_row(row) for row in rows]})


@router.post("/sessions/{session_id}/equipment-substitution")
def apply(
    session_id: int,
    body: ApplyBody,
    clerk_user_id: str = Depends(get_current_user),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    generator: SubstituteGenerator = Depends(get_substitute_generator),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    if len(set(body.positions)) != len(body.positions):
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail="positions: each position may be selected only once",
        )
    try:
        result = apply_equipment_substitution(
            session_id,
            clerk_user_id,
            body.positions,
            available_equipment=body.equipment_values(),
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=generator,
            logged=logged,
        )
    except SessionNotFound as exc:
        raise _not_found() from exc
    except SessionPerformed as exc:
        raise _performed() from exc
    except PositionsNotBlocked as exc:
        listed = ", ".join(str(position) for position in exc.positions)
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail=f"positions: not blocked by this equipment: {listed}",
        ) from exc
    return success_envelope(
        {
            "session": serialize_session(result.session),
            "outcomes": [_serialize_outcome(outcome) for outcome in result.outcomes],
        }
    )
