"""Home route: the aggregated read the Home screen renders from (F1 slice 1).

``GET /api/home`` returns the standard envelope with ``{ readiness,
current_protocol }``. ``readiness`` is the user's qualitative three-state signal
computed from their constraints and most-recent performance (ADR-0008); it
renders even when there is no Current Protocol. ``current_protocol`` is always
``null`` in this slice — the Current Protocol wiring lands in slice 2."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.domain.readiness import assess_readiness
from app.envelope import success_envelope
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository

router = APIRouter(prefix="/api", tags=["home"])


@router.get("/home")
def read_home(
    clerk_user_id: str = Depends(get_current_user),
    profiles: ProfileRepository = Depends(get_profile_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """Return the Home screen's aggregated read for the authenticated user.

    Readiness is derived server-side so the selection rule lives in the domain,
    not the client. The Current Protocol is not surfaced yet (slice 2).
    """

    profile = profiles.get_or_create(clerk_user_id)
    history = logged.list_for_user(clerk_user_id)
    readiness = assess_readiness(profile, history)
    return success_envelope(
        {"readiness": readiness.value, "current_protocol": None}
    )
