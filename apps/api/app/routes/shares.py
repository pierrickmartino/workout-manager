"""Share / Redeem HTTP endpoints (ADR-0057, CONTEXT: Share, Share Link, Redeem).

The first feature in the domain that crosses the user-ownership boundary — and it does so
**by copy over a revocable link**, never by reference. Two audiences:

**Sharer** (owner-scoped, on their own standalone Session):

* ``POST   /api/sessions/{id}/share``   — publish (or re-publish) a Share Link.
* ``DELETE /api/sessions/{id}/share``   — revoke it (future Redeems only).

**Recipient** (holds the token; identified as the redeemer by their own JWT):

* ``GET    /api/shares/{token}``         — preview the linked Session (name/type/author/validity).
* ``POST   /api/shares/{token}/redeem``  — deep-copy it into a new standalone Session they own.

Every response uses the standard envelope. Guards are raised as typed service errors and
mapped to status codes here; a revoked or unknown link fails cleanly (``404``)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.session_serialization import serialize_session
from app.repositories.deps import (
    get_session_repository,
    get_share_link_repository,
)
from app.repositories.session_repository import SessionRepository
from app.repositories.share_link_repository import (
    ShareLinkRepository,
    ShareLinkView,
)
from app.sharing.service import (
    ShareLinkInvalid,
    SharePreview,
    ShareTargetNotFound,
    ShareTargetNotStandalone,
    create_share_link,
    preview_share,
    redeem_share,
    revoke_share_link,
)

router = APIRouter(prefix="/api", tags=["shares"])

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409


def _serialize_link(view: ShareLinkView) -> dict:
    """The sharer's Share Link payload (ADR-0057). The ``token`` is the whole capability;
    the web builds the shareable URL from it. ``session_id`` lets the sharer UI tie the link
    back to the Session it was produced on, and ``is_revoked`` reflects its live/off state."""

    return {
        "token": view.token,
        "session_id": view.session_id,
        "is_revoked": view.is_revoked,
    }


def _serialize_preview(preview: SharePreview) -> dict:
    """The recipient's pre-Redeem view (ADR-0057): validity plus the linked Session's name
    label, Training Type, and Author credit — and nothing else. A revoked/unknown link comes
    back ``valid: false`` with null details, leaking nothing about a link that once existed."""

    return {
        "valid": preview.valid,
        "display_name": preview.display_name,
        "training_type": preview.training_type,
        "author": {"display_name": preview.author_display_name},
    }


@router.post("/sessions/{session_id}/share")
def create_link(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    share_links: ShareLinkRepository = Depends(get_share_link_repository),
) -> dict:
    """Publish a Share Link on the owner's standalone Session (Share, ADR-0057).

    Idempotent while a link is live: re-sharing returns the same active token, so the sharer
    UI has a stable link to copy. ``404`` for a non-owner (a user can only share their own
    plan); ``409`` on a Protocol member (a Share Link is standalone-only, like Rename/Favorite).
    Bodyless POST. On success the envelope carries the token and the shared Session id."""

    try:
        view = create_share_link(
            session_id, clerk_user_id, sessions=sessions, share_links=share_links
        )
    except ShareTargetNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    except ShareTargetNotStandalone as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A session inside a protocol can't be shared.",
        ) from exc
    return success_envelope(_serialize_link(view))


@router.delete("/sessions/{session_id}/share")
def revoke_link(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    share_links: ShareLinkRepository = Depends(get_share_link_repository),
) -> dict:
    """Revoke the owner's Share Link for this Session — the off-switch (ADR-0057).

    Stops **future** Redeems only; copies already taken are independent and untouched.
    Idempotent — revoking when nothing is active is a no-op. Bodyless DELETE, so the seam
    sends no ``Content-Type`` (ADR-0022). ``404`` for a non-owner. On success the envelope
    reports the Session id and the now-revoked state."""

    try:
        revoke_share_link(
            session_id, clerk_user_id, sessions=sessions, share_links=share_links
        )
    except ShareTargetNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    return success_envelope({"session_id": session_id, "is_revoked": True})


@router.get("/shares/{token}")
def preview_link(
    token: str,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    share_links: ShareLinkRepository = Depends(get_share_link_repository),
) -> dict:
    """Preview a Share Link without redeeming (ADR-0057).

    Lets a recipient see the linked Session's Name, Training Type, Author and validity —
    leaking nothing beyond those (no prescriptions, no owner id, no records). A revoked or
    unknown token comes back ``valid: false`` with null details, so a stale link reveals
    nothing. Always ``200`` (validity is a field, not an error) — redeeming is the act that
    fails on an invalid link. Requires auth so only a signed-in recipient can preview."""

    preview = preview_share(token, sessions=sessions, share_links=share_links)
    return success_envelope(_serialize_preview(preview))


@router.post("/shares/{token}/redeem")
def redeem_link(
    token: str,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    share_links: ShareLinkRepository = Depends(get_share_link_repository),
) -> dict:
    """Redeem a Share Link into a new standalone Session the caller owns (Redeem, ADR-0057).

    Deep-copies the linked Session at **redeem time** into an independent copy owned by the
    redeemer: prescriptions/Supersets/per-set values copied faithfully, **Author preserved**,
    **Session Name carried**, **Provenance + trace_id carried**, **no Logged Sessions**, **no
    Protocol position**, **Favorite not carried**. Each Redeem yields a fresh copy; redeeming
    one's own link is allowed. A revoked or unknown link fails cleanly (``404`` through the
    envelope). Bodyless POST. On success the envelope carries the new Session — the same shape
    the plain Session read returns — so the client lands the recipient on their new copy."""

    try:
        view = redeem_share(
            token, clerk_user_id, sessions=sessions, share_links=share_links
        )
    except ShareLinkInvalid as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND,
            detail="This share link is no longer valid.",
        ) from exc
    return success_envelope(serialize_session(view))
