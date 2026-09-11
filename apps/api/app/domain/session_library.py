"""My Sessions search rule (Session Library & Sharing, issue #397).

The **My Sessions** library lets a user search their own standalone Sessions
case-insensitively over three things: the user-given **Session Name**, the derived
**fallback label** (``training_type · date`` — so an unnamed Session, and any
Session's creation date, is still findable), and the **Training Type**
(CONTEXT: My Sessions). :func:`matches_session_search` is that predicate.

Pure — no I/O, no ORM — and it reuses :func:`app.domain.session_naming.session_label`
so the fallback label it searches is *the same* label the read surfaces, never a
re-derivation that could drift. The web view-model
(``apps/web/lib/session-library.ts``) mirrors this rule so client-side filtering has
parity with the server."""

from __future__ import annotations

from datetime import datetime

from app.domain.session_naming import session_label


def matches_session_search(
    name: str | None,
    training_type: str,
    created_at: datetime,
    query: str,
) -> bool:
    """Whether a standalone Session matches the My Sessions search ``query``.

    A blank or whitespace-only ``query`` matches every Session (the unfiltered list).
    Otherwise the trimmed, lower-cased query is a substring test against three
    lower-cased strings: the raw **Session Name** (when set), the derived fallback
    label ``training_type · date`` (always, so a named Session is still found by its
    date), and the **Training Type**.
    """

    needle = query.strip().lower()
    if not needle:
        return True

    haystacks = [
        training_type,
        # The always-present fallback label, derived from the same rule the read uses —
        # ``None`` name so it is the derived ``training_type · date``, never the name.
        session_label(None, training_type, created_at),
    ]
    if name is not None and name.strip():
        haystacks.append(name)

    return any(needle in haystack.lower() for haystack in haystacks)


__all__ = ["matches_session_search"]
