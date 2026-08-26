"""Repository layer for the Share Link (ADR-0057, CONTEXT: Share Link).

Routes and the sharing service depend on the ``ShareLinkRepository`` interface, never on
the ORM directly (the project's repository-pattern rule). Two implementations are
provided: a SQLModel-backed one for production and an in-memory fake for tests and local
wiring.

A Share Link is a **revocable, reusable** token referencing a sharer's standalone
Session. The token is **unguessable** — minted from :func:`secrets.token_urlsafe` — so it
is itself the capability to redeem; owner-scoping on create/revoke keeps a non-owner from
producing or revoking a link for someone else's Session. Revocation is a nullable
``revoked_at`` stamp (``NULL`` = active); it stops *future* Redeems but never reaches
copies already taken (they are independent Sessions their recipients own, ADR-0057).
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import ShareLink

# The byte-length of the unguessable Share Link token. 32 random bytes (~43 url-safe
# characters) puts the token far beyond any feasible guess/enumeration — the token is the
# capability that gates Redeem, so it must not be predictable (ADR-0057).
_TOKEN_BYTES = 32


def generate_share_token() -> str:
    """A fresh, unguessable url-safe Share Link token."""

    return secrets.token_urlsafe(_TOKEN_BYTES)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class ShareLinkView:
    """A Share Link ready to serialize — the token plus what it references and its state.

    ``is_revoked`` is the read-time projection of the ``revoked_at`` stamp; a consumer never
    needs the stamp itself. ``session_id`` and the sharer (``clerk_user_id``) let the service
    resolve the shared Session and keep revocation owner-scoped."""

    token: str
    session_id: int
    clerk_user_id: str
    is_revoked: bool


def _view(link: ShareLink) -> ShareLinkView:
    return ShareLinkView(
        token=link.token,
        session_id=link.session_id,
        clerk_user_id=link.clerk_user_id,
        is_revoked=link.revoked_at is not None,
    )


class ShareLinkRepository(Protocol):
    def create(self, session_id: int, clerk_user_id: str) -> ShareLinkView:
        """Produce (or re-produce) an **active** Share Link for the owner's Session.

        Idempotent while a link is live: if an active (un-revoked) link already exists for
        ``(session_id, clerk_user_id)`` it is returned, so "produce a link" is stable and a
        Session never accumulates parallel active tokens; otherwise a fresh unguessable token
        is minted. Ownership and the standalone-only guard are enforced upstream (the service
        reads the Session first), so this seam is a pure per-Session token store."""
        ...

    def revoke(self, session_id: int, clerk_user_id: str) -> None:
        """Revoke every active Share Link for the owner's ``session_id`` (ADR-0057).

        Stamps ``revoked_at`` on each active row so **future** Redeems fail; copies already
        taken are untouched (they are independent Sessions the recipients own). Idempotent —
        revoking when nothing is active is a no-op. Only ever revokes the caller's own links;
        ownership is enforced upstream."""
        ...

    def resolve_active(self, token: str) -> ShareLinkView | None:
        """The **active** link for ``token``, or ``None`` for an unknown or revoked token.

        The one lookup preview and redeem both read: it returns the link (and thus the shared
        ``session_id``) only while the token is still redeemable, collapsing "never existed"
        and "revoked" into the same ``None`` so neither the preview nor the redeem path leaks
        which one it was."""
        ...


class SqlShareLinkRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _active_for_session(
        self, session_id: int, clerk_user_id: str
    ) -> ShareLink | None:
        return self._session.exec(
            select(ShareLink).where(
                ShareLink.session_id == session_id,
                ShareLink.clerk_user_id == clerk_user_id,
                ShareLink.revoked_at.is_(None),
            )
        ).first()

    def create(self, session_id: int, clerk_user_id: str) -> ShareLinkView:
        existing = self._active_for_session(session_id, clerk_user_id)
        if existing is not None:
            return _view(existing)

        link = ShareLink(
            token=generate_share_token(),
            session_id=session_id,
            clerk_user_id=clerk_user_id,
        )
        self._session.add(link)
        self._session.commit()
        self._session.refresh(link)
        return _view(link)

    def revoke(self, session_id: int, clerk_user_id: str) -> None:
        active = self._session.exec(
            select(ShareLink).where(
                ShareLink.session_id == session_id,
                ShareLink.clerk_user_id == clerk_user_id,
                ShareLink.revoked_at.is_(None),
            )
        ).all()
        if not active:
            return
        stamped = _utcnow()
        for link in active:
            link.revoked_at = stamped
            self._session.add(link)
        self._session.commit()

    def resolve_active(self, token: str) -> ShareLinkView | None:
        link = self._session.exec(
            select(ShareLink).where(ShareLink.token == token)
        ).first()
        if link is None or link.revoked_at is not None:
            return None
        return _view(link)


class InMemoryShareLinkRepository:
    def __init__(self) -> None:
        self._links: dict[str, ShareLink] = {}
        self._next_id = 1

    def _active_for_session(
        self, session_id: int, clerk_user_id: str
    ) -> ShareLink | None:
        for link in self._links.values():
            if (
                link.session_id == session_id
                and link.clerk_user_id == clerk_user_id
                and link.revoked_at is None
            ):
                return link
        return None

    def create(self, session_id: int, clerk_user_id: str) -> ShareLinkView:
        existing = self._active_for_session(session_id, clerk_user_id)
        if existing is not None:
            return _view(existing)

        link = ShareLink(
            id=self._next_id,
            token=generate_share_token(),
            session_id=session_id,
            clerk_user_id=clerk_user_id,
        )
        self._next_id += 1
        self._links[link.token] = link
        return _view(link)

    def revoke(self, session_id: int, clerk_user_id: str) -> None:
        stamped = _utcnow()
        for link in self._links.values():
            if (
                link.session_id == session_id
                and link.clerk_user_id == clerk_user_id
                and link.revoked_at is None
            ):
                link.revoked_at = stamped

    def resolve_active(self, token: str) -> ShareLinkView | None:
        link = self._links.get(token)
        if link is None or link.revoked_at is not None:
            return None
        return _view(link)


__all__ = [
    "ShareLinkView",
    "ShareLinkRepository",
    "SqlShareLinkRepository",
    "InMemoryShareLinkRepository",
    "generate_share_token",
]
