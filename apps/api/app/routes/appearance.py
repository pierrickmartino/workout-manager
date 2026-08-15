"""Appearance routes: read and upsert the authenticated user's Mode.

``GET`` get-or-defaults (Dark when the user has no Appearance Preference yet);
``PUT`` upserts the chosen Mode. Data access goes through the repository
interface, validation happens at the boundary with Pydantic (an unknown Mode is
a 422), and the response is wrapped in the standard envelope.

Kept a separate store from the Fitness Profile (ADR-0047) so appearance never
enters generation or the cache key."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.domain.appearance import Mode
from app.envelope import success_envelope
from app.repositories.appearance_preference_repository import (
    AppearancePreferenceRepository,
)
from app.repositories.deps import get_appearance_preference_repository

router = APIRouter(prefix="/api", tags=["appearance"])


class AppearanceUpdateRequest(BaseModel):
    """Validated Mode-change payload.

    ``mode`` is typed as the closed ``Mode`` enum, so anything outside
    ``light | dark | system`` fails at the boundary with a 422 and is never
    persisted — the store only ever holds a valid, deliberate choice."""

    mode: Mode


def _serialize(mode: Mode) -> dict:
    return {"mode": mode.value}


@router.get("/appearance")
def read_appearance(
    clerk_user_id: str = Depends(get_current_user),
    repo: AppearancePreferenceRepository = Depends(
        get_appearance_preference_repository
    ),
) -> dict:
    mode = repo.get_mode(clerk_user_id)
    return success_envelope(_serialize(mode))


@router.put("/appearance")
def upsert_appearance(
    payload: AppearanceUpdateRequest,
    clerk_user_id: str = Depends(get_current_user),
    repo: AppearancePreferenceRepository = Depends(
        get_appearance_preference_repository
    ),
) -> dict:
    mode = repo.set_mode(clerk_user_id, payload.mode)
    return success_envelope(_serialize(mode))
