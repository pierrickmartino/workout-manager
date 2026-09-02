"""Share / preview / Redeem orchestration (ADR-0057, CONTEXT: Share, Share Link, Redeem).

The thin layer that composes the two repositories the Share feature spans — the
``ShareLinkRepository`` (the token store) and the ``SessionRepository`` (owner-scoped
plan reads and the cross-user Redeem copy) — behind four verbs the route calls:

* :func:`create_share_link` — the sharer publishes a Share Link on their **standalone**
  Session (withheld on a Protocol member);
* :func:`revoke_share_link` — the sharer's off-switch for *future* Redeems;
* :func:`preview_share` — a recipient sees the linked Session's Name, Training Type,
  Author and validity **without** redeeming, leaking nothing beyond those; and
* :func:`redeem_share` — a recipient turns a valid link into an independent deep-copy
  they own.

Guards are raised as typed errors the route maps to envelope status codes, mirroring the
other feature services (``app.substitution.service``, ``app.scheme_selection.service``).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.received_share import RedeemCaveat, redeem_caveat
from app.domain.session_naming import session_label
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository, SessionView
from app.repositories.share_link_repository import (
    ShareLinkRepository,
    ShareLinkView,
)


class ShareTargetNotFound(Exception):
    """The Session to share/revoke is missing or owned by another user (→ 404)."""


class ShareTargetNotStandalone(Exception):
    """Sharing was attempted on a Protocol-member Session (→ 409).

    A Share Link is offered on **standalone Sessions only** (ADR-0057), mirroring how
    Rename, Favorite, and Duplicate are withheld inside a Protocol."""


class ShareLinkInvalid(Exception):
    """A Redeem was attempted on a revoked or unknown Share Link (→ 404)."""


@dataclass(frozen=True)
class SharePreview:
    """What a recipient may see about a Share Link *before* redeeming (ADR-0057).

    Deliberately narrow — only the linked Session's validity, Name (as the never-blank
    ``display_name``), Training Type and Author credit — so preview leaks nothing beyond
    those (no prescriptions, no owner id, no records). ``valid`` is ``False`` for a revoked
    or unknown token, and the descriptive fields are then all ``None`` so a stale link
    reveals nothing about a Session it once pointed at."""

    valid: bool
    display_name: str | None = None
    training_type: str | None = None
    author_display_name: str | None = None


@dataclass(frozen=True)
class RedeemOutcome:
    """The result of a Redeem: the new copy plus its Received-Share caveat (ADR-0058).

    ``session`` is the independent copy the redeemer now owns (the same ``SessionView`` the
    plain read returns); ``caveat`` is the pure ADR-0058 decision — flagged for a redeemer with
    a Sensitive Constraint, empty otherwise. The caveat only *flags* the copy: it never blocks
    the Redeem and never mutates the plan."""

    session: SessionView
    caveat: RedeemCaveat


def create_share_link(
    session_id: int,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    share_links: ShareLinkRepository,
) -> ShareLinkView:
    """Publish (or re-publish) a Share Link on the owner's standalone Session.

    Raises :class:`ShareTargetNotFound` if the Session is missing or owned by another user,
    and :class:`ShareTargetNotStandalone` if it belongs to a Protocol. Otherwise returns the
    active link (idempotent while one is live), reusing the sharer's Session ownership as the
    scope of the token."""

    session = sessions.get(session_id, clerk_user_id)
    if session is None:
        raise ShareTargetNotFound
    if session.is_protocol_member:
        raise ShareTargetNotStandalone
    return share_links.create(session_id, clerk_user_id)


def revoke_share_link(
    session_id: int,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    share_links: ShareLinkRepository,
) -> None:
    """Revoke the owner's active Share Link(s) for ``session_id`` — the off-switch (ADR-0057).

    Stops *future* Redeems only; copies already taken are untouched. Raises
    :class:`ShareTargetNotFound` for a missing/non-owned Session so a non-owner can never
    revoke someone else's link. Idempotent — revoking when nothing is active is a no-op."""

    session = sessions.get(session_id, clerk_user_id)
    if session is None:
        raise ShareTargetNotFound
    share_links.revoke(session_id, clerk_user_id)


def preview_share(
    token: str,
    *,
    sessions: SessionRepository,
    share_links: ShareLinkRepository,
) -> SharePreview:
    """Preview the Session a Share Link points at, without redeeming (ADR-0057).

    Resolves the token to its **active** link; a revoked or unknown token yields
    ``SharePreview(valid=False)`` with no details (the two are indistinguishable, so nothing
    leaks about a link that once existed). For a valid link it reads the shared Session
    cross-user and returns only its never-blank name label, Training Type, and Author credit."""

    link = share_links.resolve_active(token)
    if link is None:
        return SharePreview(valid=False)

    session = sessions.get_shared(link.session_id)
    if session is None:
        # Defensive: the link's Session is gone (it is never deleted in v1, but a preview must
        # not raise). Treat it as no-longer-valid rather than leak a half-populated preview.
        return SharePreview(valid=False)

    return SharePreview(
        valid=True,
        display_name=session_label(
            session.name, session.training_type, session.created_at
        ),
        training_type=session.training_type,
        author_display_name=session.author_display_name,
    )


def redeem_share(
    token: str,
    redeemer_clerk_user_id: str,
    *,
    sessions: SessionRepository,
    share_links: ShareLinkRepository,
    profiles: ProfileRepository,
) -> RedeemOutcome:
    """Redeem a valid Share Link into a new standalone Session owned by the redeemer.

    Resolves the token to its active link and deep-copies the shared Session at redeem time
    (:meth:`SessionRepository.redeem`). Raises :class:`ShareLinkInvalid` for a revoked or
    unknown token — the one path this failure surfaces — and (defensively) if the source
    Session no longer exists.

    Layers the ADR-0058 Received-Share caveat onto the copy: reads the redeemer's profile and
    runs the pure :func:`redeem_caveat` rule, flagging the copy when the redeemer has a Sensitive
    Constraint. The caveat never blocks the Redeem — it is computed *after* the copy is made and
    only decorates the response. Returns a :class:`RedeemOutcome` (copy + caveat)."""

    link = share_links.resolve_active(token)
    if link is None:
        raise ShareLinkInvalid

    copy = sessions.redeem(link.session_id, redeemer_clerk_user_id)
    if copy is None:
        raise ShareLinkInvalid

    redeemer = profiles.get_or_create(redeemer_clerk_user_id)
    return RedeemOutcome(session=copy, caveat=redeem_caveat(redeemer))


__all__ = [
    "ShareTargetNotFound",
    "ShareTargetNotStandalone",
    "ShareLinkInvalid",
    "SharePreview",
    "RedeemOutcome",
    "create_share_link",
    "revoke_share_link",
    "preview_share",
    "redeem_share",
]
