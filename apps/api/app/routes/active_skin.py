"""Active Skin routes: read the app-wide Active Skin, and publish a new one (admin).

``GET /api/active-skin`` is readable by any authenticated user — the web layer
reads it server-side on every render to compose Theme = Active Skin × Mode — so it
is served through a short-TTL read-through cache rather than hitting the store each
time (ADR-0048). ``PUT /api/active-skin`` *publishes* a new Active Skin and is
gated by ``require_admin`` (the ADR-0046 ``role=admin`` claim): the publisher is
the **admin**, never the "Operator". A publish validates the incoming id against
the fixed Skin catalog and **fails closed** on an unknown id — the current Active
Skin is left untouched — then invalidates the cache so the change propagates on
users' next navigation.

Data access goes through the repository interface; the response is the standard
envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.active_skin.cache import ActiveSkinCache
from app.auth.dependencies import get_current_user, require_admin
from app.domain.skin import is_known_skin, skin_ids
from app.envelope import success_envelope
from app.repositories.active_skin_repository import ActiveSkinRepository
from app.repositories.deps import (
    get_active_skin_cache,
    get_active_skin_repository,
)

# Matches the 422 the app's validation-error envelope uses for boundary rejections
# (app.main), so an unknown-skin publish reads like any other boundary error.
HTTP_UNPROCESSABLE_ENTITY = 422

router = APIRouter(prefix="/api", tags=["active-skin"])


class ActiveSkinPublishRequest(BaseModel):
    """Validated publish payload: the Skin id to make the Active Skin.

    ``skin`` is validated against the fixed catalog inside the handler (after the
    admin gate) so the rejection message can name the id; an unknown id never
    reaches the store."""

    skin: str


def _serialize(skin_id: str) -> dict:
    return {"skin": skin_id}


@router.get("/active-skin")
def read_active_skin(
    _user: str = Depends(get_current_user),
    repo: ActiveSkinRepository = Depends(get_active_skin_repository),
    cache: ActiveSkinCache = Depends(get_active_skin_cache),
) -> dict:
    # Read through the short-TTL cache: this sits on every render, so the store is
    # consulted only on a miss/expiry (ADR-0048).
    skin_id = cache.get(repo.get_active_skin)
    return success_envelope(_serialize(skin_id))


@router.put("/active-skin")
def publish_active_skin(
    payload: ActiveSkinPublishRequest,
    _admin: str = Depends(require_admin),
    repo: ActiveSkinRepository = Depends(get_active_skin_repository),
    cache: ActiveSkinCache = Depends(get_active_skin_cache),
) -> dict:
    # Fail closed on an unknown id: reject and leave the Active Skin untouched, so
    # the app is never put into a broken palette state (ADR-0048). The admin gate
    # (require_admin) has already run, so only an admin ever reaches this check.
    if not is_known_skin(payload.skin):
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail=(
                f"unknown skin '{payload.skin}'; " f"expected one of {list(skin_ids())}"
            ),
        )

    stored = repo.set_active_skin(payload.skin)
    # Ages the read cache out immediately in this worker so the new Active Skin is
    # served now; other workers converge within the TTL (no push layer, ADR-0048).
    cache.invalidate()
    return success_envelope(_serialize(stored))
