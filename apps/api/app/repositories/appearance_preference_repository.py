"""Repository layer for the Appearance Preference (per-user Mode).

Mirrors ``ProfileRepository`` exactly: routes depend on the
``AppearancePreferenceRepository`` interface, never on the ORM directly (the
project's repository-pattern rule). Two implementations are provided — a
SQLModel-backed one for production and an in-memory fake for tests and local
wiring.

Kept a distinct seam from the Profile repository (ADR-0047) so appearance and
the Fitness Profile never share a store, and appearance can never leak into
generation or the cache key."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session, select

from app.db.models import AppearancePreference
from app.domain.appearance import DEFAULT_MODE, Mode


class AppearancePreferenceRepository(Protocol):
    def get_mode(self, clerk_user_id: str) -> Mode:
        """Return the user's chosen Mode, or the default Dark when no row exists.

        A get-or-default read: absence of a record is not an error, it is the
        shipped default, so an existing user who never chose is served Dark."""
        ...

    def set_mode(self, clerk_user_id: str, mode: Mode) -> Mode:
        """Upsert the user's Mode and return it (creating the row if absent)."""
        ...


class SqlAppearancePreferenceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _find(self, clerk_user_id: str) -> AppearancePreference | None:
        return self._session.exec(
            select(AppearancePreference).where(
                AppearancePreference.clerk_user_id == clerk_user_id
            )
        ).first()

    def get_mode(self, clerk_user_id: str) -> Mode:
        existing = self._find(clerk_user_id)
        if existing is None:
            return DEFAULT_MODE
        return Mode(existing.mode)

    def set_mode(self, clerk_user_id: str, mode: Mode) -> Mode:
        preference = self._find(clerk_user_id)
        if preference is None:
            preference = AppearancePreference(clerk_user_id=clerk_user_id)
            self._session.add(preference)

        preference.mode = mode.value
        self._session.add(preference)
        self._session.commit()
        self._session.refresh(preference)
        return Mode(preference.mode)


class InMemoryAppearancePreferenceRepository:
    def __init__(self) -> None:
        self._by_user: dict[str, Mode] = {}

    def get_mode(self, clerk_user_id: str) -> Mode:
        return self._by_user.get(clerk_user_id, DEFAULT_MODE)

    def set_mode(self, clerk_user_id: str, mode: Mode) -> Mode:
        self._by_user[clerk_user_id] = mode
        return mode


__all__ = [
    "AppearancePreferenceRepository",
    "SqlAppearancePreferenceRepository",
    "InMemoryAppearancePreferenceRepository",
]
