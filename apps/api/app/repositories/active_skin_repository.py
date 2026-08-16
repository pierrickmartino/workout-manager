"""Repository layer for the Active Skin — the single global app-setting (ADR-0048).

Routes depend on the ``ActiveSkinRepository`` interface, never on the ORM
directly (the project's repository-pattern rule). Unlike the per-user
repositories this reads/writes one *global* logical row: the whole app has
exactly one Active Skin at a time, changed only by an admin publishing.

Two implementations are provided — a SQLModel-backed one storing the value in the
generic ``app_setting`` key/value table (keyed ``active_skin``) for production,
and an in-memory fake for tests. Both default to PULSE when unset (ADR-0048), so
the app is never without an Active Skin even before the seed migration runs."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session, select

from app.db.models import AppSetting
from app.domain.skin import DEFAULT_ACTIVE_SKIN

# The ``app_setting`` key under which the Active Skin id is stored. A named
# constant so the SQL impl and the seed migration can never drift on it.
ACTIVE_SKIN_KEY = "active_skin"


class ActiveSkinRepository(Protocol):
    def get_active_skin(self) -> str:
        """Return the published Active Skin id, or PULSE when none is set.

        A get-or-default read: absence of the row is not an error, it is the
        shipped default (ADR-0048), so the app always has an Active Skin."""
        ...

    def set_active_skin(self, skin_id: str) -> str:
        """Publish ``skin_id`` as the Active Skin and return it (upsert the row).

        Callers validate ``skin_id`` against the fixed catalog *before* calling
        this — the repository stores what it is given."""
        ...


class SqlActiveSkinRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _find(self) -> AppSetting | None:
        return self._session.exec(
            select(AppSetting).where(AppSetting.key == ACTIVE_SKIN_KEY)
        ).first()

    def get_active_skin(self) -> str:
        existing = self._find()
        if existing is None:
            return DEFAULT_ACTIVE_SKIN
        return existing.value

    def set_active_skin(self, skin_id: str) -> str:
        setting = self._find()
        if setting is None:
            setting = AppSetting(key=ACTIVE_SKIN_KEY, value=skin_id)
            self._session.add(setting)
        else:
            setting.value = skin_id
            self._session.add(setting)
        self._session.commit()
        self._session.refresh(setting)
        return setting.value


class InMemoryActiveSkinRepository:
    def __init__(self) -> None:
        self._active_skin: str | None = None

    def get_active_skin(self) -> str:
        if self._active_skin is None:
            return DEFAULT_ACTIVE_SKIN
        return self._active_skin

    def set_active_skin(self, skin_id: str) -> str:
        self._active_skin = skin_id
        return skin_id


__all__ = [
    "ACTIVE_SKIN_KEY",
    "ActiveSkinRepository",
    "SqlActiveSkinRepository",
    "InMemoryActiveSkinRepository",
]
