"""Profile routes: read and upsert the authenticated user's Fitness Profile.

``GET`` get-or-creates and returns the profile; ``PUT`` upserts the full
profile (used by both onboarding and later edits). Data access goes through the
repository interface, validation happens at the boundary with Pydantic, and the
response — including the *derived* ``is_sensitive`` gate — is wrapped in the
standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user
from app.db.models import Profile
from app.domain.fitness_profile import Gender, SensitiveConstraintType, is_sensitive
from app.envelope import success_envelope
from app.repositories.deps import get_profile_repository
from app.repositories.profile_repository import ProfileRepository, ProfileUpdate

router = APIRouter(prefix="/api", tags=["profile"])

MIN_FITNESS_LEVEL = 1
MAX_FITNESS_LEVEL = 10


class ProfileUpdateRequest(BaseModel):
    """Validated onboarding / edit payload for the Fitness Profile.

    Sensitive Constraints are constrained to the known specific types, and each
    per-training-type Fitness Level must fall in 1–10. Preferences are free
    text and intentionally not validated against a vocabulary."""

    display_name: str | None = None
    gender: Gender | None = None
    age: int | None = Field(default=None, ge=0, le=150)
    height_cm: float | None = Field(default=None, gt=0)
    weight_kg: float | None = Field(default=None, gt=0)
    training_habits: str | None = None
    recent_workout: str | None = None
    default_equipment: list[str] = Field(default_factory=list)
    fitness_levels: dict[str, int] = Field(default_factory=dict)
    preferences: list[str] = Field(default_factory=list)
    sensitive_constraints: list[SensitiveConstraintType] = Field(
        default_factory=list
    )

    @field_validator("fitness_levels")
    @classmethod
    def _levels_in_range(cls, value: dict[str, int]) -> dict[str, int]:
        for training_type, level in value.items():
            if not MIN_FITNESS_LEVEL <= level <= MAX_FITNESS_LEVEL:
                raise ValueError(
                    f"fitness level for {training_type!r} must be "
                    f"{MIN_FITNESS_LEVEL}-{MAX_FITNESS_LEVEL}, got {level}"
                )
        return value

    def to_update(self) -> ProfileUpdate:
        return ProfileUpdate(
            display_name=self.display_name,
            gender=self.gender.value if self.gender is not None else None,
            age=self.age,
            height_cm=self.height_cm,
            weight_kg=self.weight_kg,
            training_habits=self.training_habits,
            recent_workout=self.recent_workout,
            default_equipment=self.default_equipment,
            fitness_levels=self.fitness_levels,
            preferences=self.preferences,
            sensitive_constraints=[c.value for c in self.sensitive_constraints],
        )


def _serialize(profile: Profile) -> dict:
    return {
        "id": profile.id,
        "clerk_user_id": profile.clerk_user_id,
        "display_name": profile.display_name,
        "gender": profile.gender,
        "age": profile.age,
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "training_habits": profile.training_habits,
        "recent_workout": profile.recent_workout,
        "default_equipment": profile.default_equipment,
        "fitness_levels": profile.fitness_levels,
        "preferences": profile.preferences,
        "sensitive_constraints": profile.sensitive_constraints,
        "is_sensitive": is_sensitive(profile),
    }


@router.get("/profile")
def read_profile(
    clerk_user_id: str = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    profile = repo.get_or_create(clerk_user_id)
    return success_envelope(_serialize(profile))


@router.put("/profile")
def upsert_profile(
    payload: ProfileUpdateRequest,
    clerk_user_id: str = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    profile = repo.update(clerk_user_id, payload.to_update())
    return success_envelope(_serialize(profile))
