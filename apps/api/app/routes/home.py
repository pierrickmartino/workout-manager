"""Home route: the aggregated read the Home screen renders from (F1 slices 1–2).

``GET /api/home`` returns the standard envelope with ``{ readiness,
current_protocol }``. ``readiness`` is the user's qualitative three-state signal
computed from their constraints and most-recent performance (ADR-0008); it
renders even when there is no Current Protocol. ``current_protocol`` is the
progressed view of the user's Current Protocol — the most-recently-adopted
Protocol still holding an un-performed Session — or ``null`` in the empty state.
Reusing the progressed view means the Next Session's upcoming loads already carry
the ADR-0004 Progression adjustment (slice 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.domain.readiness import assess_readiness
from app.envelope import success_envelope
from app.protocols.progress import current_protocol
from app.protocols.serialization import serialize_protocol_progress
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.protocol_repository import ProtocolRepository

router = APIRouter(prefix="/api", tags=["home"])


@router.get("/home")
def read_home(
    clerk_user_id: str = Depends(get_current_user),
    profiles: ProfileRepository = Depends(get_profile_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
) -> dict:
    """Return the Home screen's aggregated read for the authenticated user.

    Readiness is derived server-side so the selection rule lives in the domain,
    not the client. The Current Protocol is selected and progressed server-side so
    the Session Hero renders from data that already carries the ADR-0004 loads.
    """

    profile = profiles.get_or_create(clerk_user_id)
    history = logged.list_for_user(clerk_user_id)
    readiness = assess_readiness(profile, history)

    current = current_protocol(clerk_user_id, protocols=protocols, logged=logged)
    return success_envelope(
        {
            "readiness": readiness.value,
            "current_protocol": (
                serialize_protocol_progress(current)
                if current is not None
                else None
            ),
        }
    )
