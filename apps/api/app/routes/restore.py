"""Restore route (ADR-0143, #788).

``POST /api/sessions/{id}/prescriptions/{position}/restore`` puts a substituted Exercise
Prescription back to its Prescribed Original — Exercise, Load and Progression Scheme —
on the owner's own Session, clears the snapshot, and returns the updated Session under
the standard envelope. No AI call. A Session the caller does not own, or an absent
position, is ``404``; a prescription with no snapshot, or a performed Protocol Session,
is ``409``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.repositories.deps import (
    get_logged_session_repository,
    get_session_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.session_repository import SessionRepository
from app.session_serialization import serialize_session
from app.substitution.service import (
    NoPrescribedOriginal,
    PrescriptionNotFound,
    SessionNotFound,
    SessionPerformed,
    restore_original,
)

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409

router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/sessions/{session_id}/prescriptions/{position}/restore")
def restore(
    session_id: int,
    position: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    try:
        view = restore_original(
            session_id, clerk_user_id, position, sessions=sessions, logged=logged
        )
    except (SessionNotFound, PrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    except SessionPerformed as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A performed Protocol Session can’t be changed.",
        ) from exc
    except NoPrescribedOriginal as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="This exercise has no original to restore.",
        ) from exc
    return success_envelope(serialize_session(view))
