"""Repository layer for the Fitness Profile.

Routes depend on the ``ProfileRepository`` interface, never on the ORM
directly (see the project's repository-pattern rule). Two implementations are
provided: a SQLModel-backed one for production and an in-memory fake for tests
and local wiring."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Profile


class ProfileRepository(Protocol):
    def get_or_create(self, clerk_user_id: str) -> Profile:
        """Return the profile for ``clerk_user_id``, creating it if absent."""
        ...


class SqlProfileRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_or_create(self, clerk_user_id: str) -> Profile:
        existing = self._session.exec(
            select(Profile).where(Profile.clerk_user_id == clerk_user_id)
        ).first()
        if existing is not None:
            return existing

        profile = Profile(clerk_user_id=clerk_user_id, display_name=None)
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
