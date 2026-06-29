"""Repository layer for the Fitness Profile.

Routes depend on the ``ProfileRepository`` interface, never on the ORM
directly (see the project's repository-pattern rule). Two implementations are
provided: a SQLModel-backed one for production and an in-memory fake for tests
and local wiring."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Profile


@dataclass(frozen=True)
class ProfileUpdate:
    """The editable fields of a Fitness Profile, applied as one snapshot.

    A frozen DTO so the repository's input contract is explicit and immutable;
    every field is optional so onboarding and later edits share one path."""

    display_name: str | None = None
    gender: str | None = None
    age: int | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    training_habits: str | None = None
    recent_workout: str | None = None
    default_equipment: list[str] = field(default_factory=list)
    fitness_levels: dict[str, int] = field(default_factory=dict)
    preferences: list[str] = field(default_factory=list)
    sensitive_constraints: list[str] = field(default_factory=list)


class ProfileRepository(Protocol):
    def get_or_create(self, clerk_user_id: str) -> Profile:
        """Return the profile for ``clerk_user_id``, creating it if absent."""
        ...

    def update(self, clerk_user_id: str, update: ProfileUpdate) -> Profile:
        """Apply ``update`` to the user's profile (creating it first if absent)
        and return the updated profile."""
        ...


def _apply_update(profile: Profile, update: ProfileUpdate) -> None:
    profile.display_name = update.display_name
    profile.gender = update.gender
    profile.age = update.age
    profile.height_cm = update.height_cm
    profile.weight_kg = update.weight_kg
    profile.training_habits = update.training_habits
    profile.recent_workout = update.recent_workout
    profile.default_equipment = list(update.default_equipment)
    profile.fitness_levels = dict(update.fitness_levels)
    profile.preferences = list(update.preferences)
    profile.sensitive_constraints = list(update.sensitive_constraints)


class SqlProfileRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _find(self, clerk_user_id: str) -> Profile | None:
        return self._session.exec(
            select(Profile).where(Profile.clerk_user_id == clerk_user_id)
        ).first()

    def get_or_create(self, clerk_user_id: str) -> Profile:
        existing = self._find(clerk_user_id)
        if existing is not None:
            return existing

        profile = Profile(clerk_user_id=clerk_user_id, display_name=None)
        self._session.add(profile)
        self._session.commit()
        self._session.refresh(profile)
        return profile

    def update(self, clerk_user_id: str, update: ProfileUpdate) -> Profile:
        profile = self._find(clerk_user_id)
        if profile is None:
            profile = Profile(clerk_user_id=clerk_user_id)
            self._session.add(profile)

        _apply_update(profile, update)
        self._session.add(profile)
        self._session.commit()
        self._session.refresh(profile)
        return profile


class InMemoryProfileRepository:
    def __init__(self) -> None:
        self._by_user: dict[str, Profile] = {}
        self._next_id = 1

    def get_or_create(self, clerk_user_id: str) -> Profile:
        existing = self._by_user.get(clerk_user_id)
        if existing is not None:
            return existing

        profile = Profile(
            id=self._next_id, clerk_user_id=clerk_user_id, display_name=None
        )
        self._next_id += 1
        self._by_user[clerk_user_id] = profile
        return profile

    def update(self, clerk_user_id: str, update: ProfileUpdate) -> Profile:
        profile = self.get_or_create(clerk_user_id)
        _apply_update(profile, update)
        self._by_user[clerk_user_id] = profile
        return profile


__all__ = [
    "ProfileRepository",
    "ProfileUpdate",
    "SqlProfileRepository",
    "InMemoryProfileRepository",
]
