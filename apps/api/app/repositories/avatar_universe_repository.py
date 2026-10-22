"""Repository layer for the Avatar Universe — a single global app-setting (ADR-0137).

Routes depend on the ``AvatarUniverseRepository`` interface, never on the ORM directly
(the project's repository-pattern rule). Like the Active Skin (ADR-0048) this reads and
writes one *global* logical row: the whole app shows exactly one Avatar Universe at a
time, changed only by an admin publishing.

Two implementations are provided — a SQLModel-backed one storing the value in the
generic ``app_setting`` key/value table (keyed ``avatar_universe``) for production, and
an in-memory fake for tests. Both default to The Realm when unset, so no seed migration
is needed: before the first publish the app shows the original fantasy cast."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session, select

from app.db.models import AppSetting
from app.domain.avatars import resolve_avatar_universe

# The ``app_setting`` key under which the Avatar Universe id is stored.
AVATAR_UNIVERSE_KEY = "avatar_universe"


class AvatarUniverseRepository(Protocol):
    def get_avatar_universe(self) -> str:
        """Return the published Avatar Universe, or The Realm when none is set.

        A tolerant read: an absent row, or a stored id no longer in the catalog, is
        the shipped default rather than an error."""
        ...

    def set_avatar_universe(self, universe: str) -> str:
        """Publish ``universe`` as the Avatar Universe and return it (upsert the row).

        Callers validate ``universe`` against the fixed list *before* calling this —
        the repository stores what it is given."""
        ...


class SqlAvatarUniverseRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _find(self) -> AppSetting | None:
        return self._session.exec(
            select(AppSetting).where(AppSetting.key == AVATAR_UNIVERSE_KEY)
        ).first()

    def get_avatar_universe(self) -> str:
        existing = self._find()
        return resolve_avatar_universe(existing.value if existing else None)

    def set_avatar_universe(self, universe: str) -> str:
        setting = self._find()
        if setting is None:
            setting = AppSetting(key=AVATAR_UNIVERSE_KEY, value=universe)
        else:
            setting.value = universe
        self._session.add(setting)
        self._session.commit()
        self._session.refresh(setting)
        return setting.value


class InMemoryAvatarUniverseRepository:
    def __init__(self) -> None:
        self._universe: str | None = None

    def get_avatar_universe(self) -> str:
        return resolve_avatar_universe(self._universe)

    def set_avatar_universe(self, universe: str) -> str:
        self._universe = universe
        return universe


__all__ = [
    "AVATAR_UNIVERSE_KEY",
    "AvatarUniverseRepository",
    "SqlAvatarUniverseRepository",
    "InMemoryAvatarUniverseRepository",
]
