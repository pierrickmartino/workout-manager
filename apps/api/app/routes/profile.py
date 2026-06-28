"""Profile route: get-or-create the authenticated user's Fitness Profile.

Data access goes through the repository interface, never direct ORM calls, and
the response is wrapped in the standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.repositories.deps import get_profile_repository
from app.repositories.profile_repository import ProfileRepository

router = APIRouter(prefix="/api", tags=["profile"])


@router.get("/profile")
def read_profile(
    clerk_user_id: str = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    profile = repo.get_or_create(clerk_user_id)
    return success_envelope(
        {
            "id": profile.id,
            "clerk_user_id": profile.clerk_user_id,
            "display_name": profile.display_name,
        }
    )
