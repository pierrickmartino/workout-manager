"""Repository layer for the Session Favorite (per-user, per-copy marker).

Routes and the Session read path depend on the ``FavoriteRepository`` interface, never on
the ORM directly (the project's repository-pattern rule). Two implementations are provided:
a SQLModel-backed one for production and an in-memory fake for tests and local wiring.

A Favorite is a **stored, per-user, per-copy** preference keyed by ``(clerk_user_id,
session_id)`` (CONTEXT: Favorite, issue #396) — the same species as a Pinned Target, which
the domain deliberately stores; it is *not* a read-time projection (ADR-0018 governs derived
facts, not user choices). Kept a distinct seam from ``SessionRepository`` so the marker
never widens the Session's own write surface, and so a redeemed/duplicated copy — a new
``session_id`` with no row here — simply starts un-favorited for its new owner."""

from __future__ import annotations

from typing import Protocol

from sqlmodel import Session, select

from app.db.models import SessionFavorite


class FavoriteRepository(Protocol):
    def is_favorite(self, clerk_user_id: str, session_id: int) -> bool:
        """Whether ``clerk_user_id`` has favorited ``session_id``.

        A presence read: a row means favorited, its absence means not. Private to the
        user — another user's mark on the same Session is invisible here."""
        ...

    def set_favorite(
        self, clerk_user_id: str, session_id: int, favorite: bool
    ) -> None:
        """Mark (``favorite=True``) or unmark (``favorite=False``) ``session_id`` for
        ``clerk_user_id``.

        Idempotent in both directions: marking an already-favorited Session leaves the one
        row untouched, and unmarking an un-favorited Session is a no-op. Only ever writes the
        caller's own marker — ownership of the Session is enforced upstream (the route/session
        repository), so this seam stays a pure per-user key/value store."""
        ...


class SqlFavoriteRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _find(self, clerk_user_id: str, session_id: int) -> SessionFavorite | None:
        return self._session.exec(
            select(SessionFavorite).where(
                SessionFavorite.clerk_user_id == clerk_user_id,
                SessionFavorite.session_id == session_id,
            )
        ).first()

    def is_favorite(self, clerk_user_id: str, session_id: int) -> bool:
        return self._find(clerk_user_id, session_id) is not None

    def set_favorite(
        self, clerk_user_id: str, session_id: int, favorite: bool
    ) -> None:
        existing = self._find(clerk_user_id, session_id)
        if favorite:
            # Idempotent mark: keep the single existing row rather than insert a duplicate the
            # unique constraint would reject.
            if existing is None:
                self._session.add(
                    SessionFavorite(
                        clerk_user_id=clerk_user_id, session_id=session_id
                    )
                )
                self._session.commit()
            return

        # Unmark: drop the row if present, else a no-op.
        if existing is not None:
            self._session.delete(existing)
            self._session.commit()


class InMemoryFavoriteRepository:
    def __init__(self) -> None:
        # The set of (user, session) pairs currently marked — presence is the marker, matching
        # the SQL row's presence semantics exactly.
        self._marks: set[tuple[str, int]] = set()

    def is_favorite(self, clerk_user_id: str, session_id: int) -> bool:
        return (clerk_user_id, session_id) in self._marks

    def set_favorite(
        self, clerk_user_id: str, session_id: int, favorite: bool
    ) -> None:
        key = (clerk_user_id, session_id)
        if favorite:
            self._marks.add(key)
        else:
            self._marks.discard(key)


__all__ = [
    "FavoriteRepository",
    "SqlFavoriteRepository",
    "InMemoryFavoriteRepository",
]
