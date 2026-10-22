"""Appearance routes: read and upsert the authenticated user's Interface Preference.

The store behind ``/api/appearance`` now holds the whole **Interface Preference**
(Mode + Keep Screen Awake + Weight Unit + Avatar) — the physical ``/api/appearance`` path stays as an
incidental legacy detail even though the concept generalised past *appearance*
(ADR-0055). ``GET`` get-or-defaults (Dark + Keep-Screen-Awake on when the user has
no stored preference yet); ``PUT`` upserts the chosen values. Data access goes
through the repository interface, validation happens at the boundary with Pydantic
(an unknown Mode or ill-typed value is a 422), and the response is wrapped in the
standard envelope.

``GET`` also returns the chosen **Avatar** (ADR-0136), always a catalog id: no
choice, or an id since retired from the catalog, reads as the Novice. It computes
no XP, so the per-page layout read stays cheap.

PUT accepts each facet independently: an omitted field keeps the user's current
value, so the Mode picker, the Keep-Screen-Awake toggle, the Weight-Unit toggle and
the Avatar picker each save only their own facet without disturbing the others. The route reads the
current preference, applies the provided facets, and upserts the whole value.

Choosing an Avatar is the one save judged against the record: an unknown id is a 422
at the boundary, and an Avatar whose unlock level is above the user's Operator Level —
computed at save time from their Logged Sessions — is a 403 with nothing written. Only
that save reads the history; an Avatar already chosen is kept when the level later
drops (ADR-0136). The refusal names the character as the published Avatar Universe
casts it (ADR-0137), read only when a refusal is raised.

Kept a separate store from the Fitness Profile (ADR-0047) so an Interface
Preference never enters generation or the cache key."""

from __future__ import annotations

from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.auth.dependencies import get_current_user
from app.avatar_universe.cache import AvatarUniverseCache
from app.domain.appearance import InterfacePreference, Mode, WeightUnit
from app.domain.avatars import avatar_name, find_avatar, is_avatar_id, is_unlocked
from app.envelope import success_envelope
from app.logbook.operator_level import current_operator_level
from app.repositories.appearance_preference_repository import (
    AppearancePreferenceRepository,
)
from app.repositories.avatar_universe_repository import AvatarUniverseRepository
from app.repositories.deps import (
    get_appearance_preference_repository,
    get_avatar_universe_cache,
    get_avatar_universe_repository,
    get_logged_session_repository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["appearance"])

HTTP_FORBIDDEN = 403


class AppearanceUpdateRequest(BaseModel):
    """Validated Interface Preference change payload.

    Every facet is optional so each control saves only its own: an omitted field
    leaves the user's current value untouched. ``mode`` is typed as the closed
    ``Mode`` enum, ``keep_screen_awake`` as a bool, and ``weight_unit`` as the closed
    ``WeightUnit`` enum, so anything ill-typed fails at the boundary with a 422 and
    is never persisted — the store only ever holds a valid, deliberate choice.
    ``avatar`` must be a catalog id: writing is strict where reading is tolerant
    (ADR-0136)."""

    mode: Mode | None = None
    keep_screen_awake: bool | None = None
    weight_unit: WeightUnit | None = None
    avatar: str | None = None

    @field_validator("avatar")
    @classmethod
    def _known_avatar(cls, value: str | None) -> str | None:
        if value is not None and not is_avatar_id(value):
            raise ValueError("unknown Avatar")
        return value


def _ensure_unlocked(
    avatar_id: str,
    clerk_user_id: str,
    logged: LoggedSessionRepository,
    read_universe: Callable[[], str],
) -> None:
    """Refuse ``avatar_id`` unless the user's Operator Level has reached it.

    The level is computed now from the user's Logged Sessions through the shared
    gamification projection, never read from a stored unlock (ADR-0018, ADR-0136).
    ``read_universe`` is called only to name the character in a refusal."""

    avatar = find_avatar(avatar_id)
    level = current_operator_level(clerk_user_id, logged)
    if avatar is not None and not is_unlocked(avatar, level):
        raise HTTPException(
            status_code=HTTP_FORBIDDEN,
            detail=(
                f"{avatar_name(avatar, read_universe())} unlocks at LVL {avatar.unlock_level}. "
                f"You’re at LVL {level}: keep logging to reach it."
            ),
        )


def _serialize(preference: InterfacePreference) -> dict:
    return {
        "mode": preference.mode.value,
        "keep_screen_awake": preference.keep_screen_awake,
        "weight_unit": preference.weight_unit.value,
        "avatar": preference.avatar,
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
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    universes: AvatarUniverseRepository = Depends(get_avatar_universe_repository),
    universe_cache: AvatarUniverseCache = Depends(get_avatar_universe_cache),
) -> dict:
    # Apply only the facets the caller sent onto the current (get-or-default)
    # preference, then upsert the whole value — so Mode, Keep Screen Awake, Weight
    # Unit and Avatar are independently settable and no save disturbs the others.
    current = repo.get_preference(clerk_user_id)
    # Only choosing a *different* Avatar is judged against the Operator Level, so the
    # history is read for that save alone, and an Avatar already chosen is kept when
    # the level later drops (ADR-0136).
    if payload.avatar is not None and payload.avatar != current.avatar:
        _ensure_unlocked(
            payload.avatar,
            clerk_user_id,
            logged,
            lambda: universe_cache.get(universes.get_avatar_universe),
        )
    updated = current.with_overrides(
        mode=payload.mode,
        keep_screen_awake=payload.keep_screen_awake,
        weight_unit=payload.weight_unit,
        avatar=payload.avatar,
    )
    stored = repo.set_preference(clerk_user_id, updated)
    return success_envelope(_serialize(stored))
