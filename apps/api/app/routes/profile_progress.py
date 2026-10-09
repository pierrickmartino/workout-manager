"""Profile progress route: the honest read model the Profile view screen renders from.

``GET /api/profile/progress`` returns the standard envelope with the account's XP and
Operator Level, the weekly Streak, the lifetime Total Sessions / Total Sets, and the
per-Training-Type Fitness Level standing, computed by ``logbook/profile_progress.py``
over the user's Logged Sessions. Every figure is derived read-time from the *record*
side — no stored counters (ADR-0018) — so the numbers can never drift from the log. The
Streak window ends on the server's current date. Reads are scoped to the authenticated
user.

The **Effective Fitness Level** is served from here, beside Operator Level, and
deliberately never from the Profile endpoint (ADR-0112): that endpoint's ``fitness_levels``
field is one shape in both directions — a validated request field as well as a response
field, written back by the Profile form — so a derived value placed there round-trips and
the first careless save persists a projection into the declared baseline. This route reads
the Fitness Profile for the Declared levels and writes nothing back to it."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.domain.achievements import Achievement
from app.envelope import success_envelope
from app.logbook.profile_progress import (
    FitnessLevelStanding,
    ProfileProgress,
    profile_progress,
)
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository

router = APIRouter(prefix="/api", tags=["profile"])


def _serialize_achievement(achievement: Achievement) -> dict:
    return {
        "id": achievement.id,
        "name": achievement.name,
        "criteria": achievement.criteria,
        "unlocked": achievement.unlocked,
        "current": achievement.current,
        "target": achievement.target,
        # ISO-8601 date, or null while the badge is locked.
        "unlocked_on": (
            achievement.unlocked_on.isoformat()
            if achievement.unlocked_on is not None
            else None
        ),
        # The Logged Session whose logging crossed the target — the Stamp page's source
        # link (#652) — or null while locked. Read-time like the date, so it follows a
        # deletion to the next crossing session and never names a missing record.
        "unlocked_by_session_id": achievement.unlocked_by_session_id,
    }


def _serialize_fitness_level(standing: FitnessLevelStanding) -> dict:
    """One Training Type's two readings: what the user declared, and what the app plans
    with. Both are always present — the equal case is a stated row, not an omission."""

    return {
        "training_type": standing.training_type,
        "declared": standing.declared,
        "effective": standing.effective,
    }


def _serialize(progress: ProfileProgress) -> dict:
    return {
        "xp": progress.xp,
        "level": {
            "level": progress.level.level,
            "xp_into_level": progress.level.xp_into_level,
            "xp_span_of_level": progress.level.xp_span_of_level,
            "xp_to_next": progress.level.xp_to_next,
        },
        "streak": progress.streak,
        "total_sessions": progress.total_sessions,
        "total_sets": progress.total_sets,
        "achievements": [
            _serialize_achievement(achievement) for achievement in progress.achievements
        ],
        "fitness_levels": [
            _serialize_fitness_level(standing) for standing in progress.fitness_levels
        ],
    }


@router.get("/profile/progress")
def read_profile_progress(
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    # The Declared levels are the standing's second input. Read through the repository's
    # read-only accessor rather than ``get_or_create``: this is a GET, and the one thing it
    # must never do with a level is write one (ADR-0112). A user with no profile reads as
    # an empty mapping and so projects no standing at all.
    progress = profile_progress(
        clerk_user_id,
        logged=logged,
        declared_levels=profiles.declared_fitness_levels(clerk_user_id),
        today=date.today(),
    )
    return success_envelope(_serialize(progress))
