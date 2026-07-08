"""Profile progress route: the honest read model the Profile view screen renders from.

``GET /api/profile/progress`` returns the standard envelope with the weekly Streak and
lifetime Total Sessions / Total Sets, computed by ``logbook/profile_progress.py`` over
the user's Logged Sessions. Every figure is derived read-time from the *record* side —
no stored counters (ADR-0018) — so the numbers can never drift from the log. The Streak
window ends on the server's current date. Reads are scoped to the authenticated user."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.logbook.profile_progress import ProfileProgress, profile_progress
from app.repositories.deps import get_logged_session_repository
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["profile"])


def _serialize(progress: ProfileProgress) -> dict:
    return {
        "streak": progress.streak,
        "total_sessions": progress.total_sessions,
        "total_sets": progress.total_sets,
    }


@router.get("/profile/progress")
def read_profile_progress(
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    progress = profile_progress(clerk_user_id, logged=logged, today=date.today())
    return success_envelope(_serialize(progress))
