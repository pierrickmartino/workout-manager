"""Appearance routes: read and upsert the authenticated user's Interface Preference.

The store behind ``/api/appearance`` now holds the whole **Interface Preference**
(Mode + Keep Screen Awake) — the physical ``/api/appearance`` path stays as an
incidental legacy detail even though the concept generalised past *appearance*
(ADR-0055). ``GET`` get-or-defaults (Dark + Keep-Screen-Awake on when the user has
no stored preference yet); ``PUT`` upserts the chosen values. Data access goes
through the repository interface, validation happens at the boundary with Pydantic
(an unknown Mode or ill-typed value is a 422), and the response is wrapped in the
standard envelope.

PUT accepts each facet independently: an omitted field keeps the user's current
value, so the Mode picker, the Keep-Screen-Awake toggle, and the Weight-Unit toggle
each save only their own facet without disturbing the others. The route reads the
current preference, applies the provided facets, and upserts the whole value.

Kept a separate store from the Fitness Profile (ADR-0047) so an Interface
Preference never enters generation or the cache key."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.domain.appearance import InterfacePreference, Mode, WeightUnit
from app.envelope import success_envelope
from app.repositories.appearance_preference_repository import (
    AppearancePreferenceRepository,
)
from app.repositories.deps import get_appearance_preference_repository

router = APIRouter(prefix="/api", tags=["appearance"])


class AppearanceUpdateRequest(BaseModel):
    """Validated Interface Preference change payload.

    Every facet is optional so each control saves only its own: an omitted field
    leaves the user's current value untouched. ``mode`` is typed as the closed
    ``Mode`` enum, ``keep_screen_awake`` as a bool, and ``weight_unit`` as the closed
    ``WeightUnit`` enum, so anything ill-typed fails at the boundary with a 422 and
    is never persisted — the store only ever holds a valid, deliberate choice."""

    mode: Mode | None = None
    keep_screen_awake: bool | None = None
    weight_unit: WeightUnit | None = None


def _serialize(preference: InterfacePreference) -> dict:
    return {
        "mode": preference.mode.value,
        "keep_screen_awake": preference.keep_screen_awake,
        "weight_unit": preference.weight_unit.value,
    }


@router.get("/appearance")
def read_appearance(
    clerk_user_id: str = Depends(get_current_user),
    repo: AppearancePreferenceRepository = Depends(
        get_appearance_preference_repository
    ),
) -> dict:
    preference = repo.get_preference(clerk_user_id)
    return success_envelope(_serialize(preference))


@router.put("/appearance")
def upsert_appearance(
    payload: AppearanceUpdateRequest,
    clerk_user_id: str = Depends(get_current_user),
    repo: AppearancePreferenceRepository = Depends(
        get_appearance_preference_repository
    ),
) -> dict:
    # Apply only the facets the caller sent onto the current (get-or-default)
    # preference, then upsert the whole value — so Mode, Keep Screen Awake, and
    # Weight Unit are independently settable and no save disturbs the other facets.
    current = repo.get_preference(clerk_user_id)
    updated = current.with_overrides(
        mode=payload.mode,
        keep_screen_awake=payload.keep_screen_awake,
        weight_unit=payload.weight_unit,
    )
    stored = repo.set_preference(clerk_user_id, updated)
    return success_envelope(_serialize(stored))
