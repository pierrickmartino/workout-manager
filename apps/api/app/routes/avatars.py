"""Avatar routes: the catalog the Avatar picker renders from (ADR-0136, ADR-0137).

``GET /api/avatars`` returns the standard envelope with the user's current Operator
Level, the published Avatar Universe, and the curated Avatar catalog in display order,
each entry named as its character in that universe, with its unlock level,
whether the user may choose it now, and their progress toward it. The level is computed read-time from the user's
Logged Sessions through the shared gamification projection, so lock state can never
drift from the log and no unlock is ever stored (ADR-0018/0019). Choosing an Avatar goes
through ``PUT /api/appearance``, which repeats the same check at save time."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.avatar_universe.cache import AvatarUniverseCache
from app.domain.avatars import AvatarStanding, avatar_name, avatar_standings
from app.envelope import success_envelope
from app.logbook.operator_level import current_operator_level
from app.repositories.avatar_universe_repository import AvatarUniverseRepository
from app.repositories.deps import (
    get_avatar_universe_cache,
    get_avatar_universe_repository,
    get_logged_session_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["avatars"])


def _serialize_standing(standing: AvatarStanding, universe: str) -> dict:
    return {
        "id": standing.avatar.id,
        "name": avatar_name(standing.avatar, universe),
        "unlock_level": standing.avatar.unlock_level,
        "unlocked": standing.unlocked,
        "current_level": standing.current_level,
    }


@router.get("/avatars")
def read_avatars(
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    universes: AvatarUniverseRepository = Depends(get_avatar_universe_repository),
    universe_cache: AvatarUniverseCache = Depends(get_avatar_universe_cache),
) -> dict:
    level = current_operator_level(clerk_user_id, logged)
    universe = universe_cache.get(universes.get_avatar_universe)
    return success_envelope(
        {
            "operator_level": level,
            "universe": universe,
            "avatars": [
                _serialize_standing(s, universe) for s in avatar_standings(level)
            ],
        }
    )
