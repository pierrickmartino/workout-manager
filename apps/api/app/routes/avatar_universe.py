"""Avatar Universe routes: read the app-wide Avatar Universe, and publish a new one (admin).

``GET /api/avatar-universe`` is readable by any authenticated user — the web layer reads
it server-side on every render to draw each user's Avatar in the header — so it is served
through the same short-TTL read-through cache as the Active Skin (ADR-0048, ADR-0137).
``PUT /api/avatar-universe`` *publishes* a new universe and is gated by
``require_admin`` (the ADR-0046 ``role=admin`` claim). A publish validates the id against
the fixed list of universes and **fails closed** on an unknown one — the current
universe is left untouched — then invalidates the cache so the change reaches users on
their next navigation. No user's chosen Avatar changes: the choice is a catalog id that
every universe draws.

Data access goes through the repository interface; the response is the standard
envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import get_current_user, require_admin
from app.avatar_universe.cache import AvatarUniverseCache
from app.domain.avatars import AVATAR_UNIVERSES, is_avatar_universe
from app.envelope import success_envelope
from app.repositories.avatar_universe_repository import AvatarUniverseRepository
from app.repositories.deps import (
    get_avatar_universe_cache,
    get_avatar_universe_repository,
)

# Matches the 422 the app's validation-error envelope uses for boundary rejections.
HTTP_UNPROCESSABLE_ENTITY = 422

router = APIRouter(prefix="/api", tags=["avatar-universe"])


class AvatarUniversePublishRequest(BaseModel):
    """Validated publish payload: the universe id to make the Avatar Universe.

    ``universe`` is checked against the fixed list inside the handler (after the admin
    gate) so the rejection can name the id; an unknown id never reaches the store."""

    universe: str


def _serialize(universe: str) -> dict:
    return {"universe": universe}


@router.get("/avatar-universe")
def read_avatar_universe(
    _user: str = Depends(get_current_user),
    repo: AvatarUniverseRepository = Depends(get_avatar_universe_repository),
    cache: AvatarUniverseCache = Depends(get_avatar_universe_cache),
) -> dict:
    return success_envelope(_serialize(cache.get(repo.get_avatar_universe)))


@router.put("/avatar-universe")
def publish_avatar_universe(
    payload: AvatarUniversePublishRequest,
    _admin: str = Depends(require_admin),
    repo: AvatarUniverseRepository = Depends(get_avatar_universe_repository),
    cache: AvatarUniverseCache = Depends(get_avatar_universe_cache),
) -> dict:
    # Fail closed on an unknown id: reject and leave the current universe untouched.
    if not is_avatar_universe(payload.universe):
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail=(
                f"unknown Avatar Universe '{payload.universe}'; "
                f"expected one of {list(AVATAR_UNIVERSES)}"
            ),
        )

    stored = repo.set_avatar_universe(payload.universe)
    # Serve the new universe now in this worker; others converge within the TTL.
    cache.invalidate()
    return success_envelope(_serialize(stored))
