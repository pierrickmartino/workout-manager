"""Repository layer for the Interface Preference (per-user Mode + Keep Screen Awake).

Mirrors ``ProfileRepository`` exactly: routes depend on the
``AppearancePreferenceRepository`` interface, never on the ORM directly (the
project's repository-pattern rule). Two implementations are provided — a
SQLModel-backed one for production and an in-memory fake for tests and local
wiring.

The whole Interface Preference (Mode + Keep Screen Awake) is read and upserted as
one value (ADR-0055) rather than a method pair per facet. The physical
``appearance_*`` name stays as an incidental legacy detail even though the concept
generalised past *appearance* (ADR-0055). Kept a distinct seam from the Profile
repository (ADR-0047) so the Interface Preference and the Fitness Profile never
share a store, and a UI preference can never leak into generation or the cache
key."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session, select

from app.db.models import AppearancePreference
from app.domain.appearance import (
    DEFAULT_INTERFACE_PREFERENCE,
    InterfacePreference,
    Mode,
    WeightUnit,
)


class AppearancePreferenceRepository(Protocol):
    def get_preference(self, clerk_user_id: str) -> InterfacePreference:
        """Return the user's whole Interface Preference, or the shipped defaults.

        A get-or-default read: absence of a record is not an error, it is the
        shipped default (Dark + Keep-Screen-Awake on), so an existing user who
        never chose is served ``DEFAULT_INTERFACE_PREFERENCE``."""
        ...

    def set_preference(
        self, clerk_user_id: str, preference: InterfacePreference
    ) -> InterfacePreference:
        """Upsert the user's whole Interface Preference and return it stored."""
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

    @staticmethod
    def _to_domain(row: AppearancePreference) -> InterfacePreference:
        """Map a stored row to the whole domain Interface Preference.

        The one place raw column values are re-typed into the domain value, so
        every facet is read back the same way and adding the next one is a single
        edit here rather than in both ``get`` and ``set``."""

        return InterfacePreference(
            mode=Mode(row.mode),
            keep_screen_awake=row.keep_screen_awake,
            weight_unit=WeightUnit(row.weight_unit),
        )

    def get_preference(self, clerk_user_id: str) -> InterfacePreference:
        existing = self._find(clerk_user_id)
        if existing is None:
            return DEFAULT_INTERFACE_PREFERENCE
        return self._to_domain(existing)

    def set_preference(
        self, clerk_user_id: str, preference: InterfacePreference
    ) -> InterfacePreference:
        row = self._find(clerk_user_id)
        if row is None:
            row = AppearancePreference(clerk_user_id=clerk_user_id)
            self._session.add(row)

        row.mode = preference.mode.value
        row.keep_screen_awake = preference.keep_screen_awake
        row.weight_unit = preference.weight_unit.value
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return self._to_domain(row)


class InMemoryAppearancePreferenceRepository:
    def __init__(self) -> None:
        self._by_user: dict[str, InterfacePreference] = {}

    def get_preference(self, clerk_user_id: str) -> InterfacePreference:
        return self._by_user.get(clerk_user_id, DEFAULT_INTERFACE_PREFERENCE)

    def set_preference(
        self, clerk_user_id: str, preference: InterfacePreference
    ) -> InterfacePreference:
        self._by_user[clerk_user_id] = preference
        return preference


__all__ = [
    "AppearancePreferenceRepository",
    "SqlAppearancePreferenceRepository",
    "InMemoryAppearancePreferenceRepository",
]
