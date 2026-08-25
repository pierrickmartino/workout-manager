"""Standalone-Session display-label rule (Session Library & Sharing, issue #394).

A standalone Session carries a user-given **Session Name** (CONTEXT: Session Name).
It is nullable and never backfilled, so every read path resolves a display label
through :func:`session_label`: the name when the user set one, otherwise a derived
``training_type · date`` label so an unnamed Session is never blank — the same
pattern as a Protocol's name (``app.domain.protocol.protocol_label``, ADR-0021).

Pure — no I/O, no ORM — so the Session serializer and the My Sessions search (#393)
share the one rule instead of each re-deriving the fallback."""

from __future__ import annotations

from datetime import datetime

# The separator joining training type and creation date in the derived fallback label,
# matching the Protocol label's separator so the two derived labels read alike.
_LABEL_SEPARATOR = " · "


def session_label(
    name: str | None, training_type: str, created_at: datetime
) -> str:
    """The Session's display label: its **Session Name** when set, else the fallback.

    A name that is ``None`` or only whitespace is treated as unset — a born-unnamed
    Session reads as ``"training_type · YYYY-MM-DD"`` (its creation date), with no
    backfill. A real name is returned trimmed of surrounding whitespace.
    """

    if name is not None and name.strip():
        return name.strip()
    return f"{training_type}{_LABEL_SEPARATOR}{created_at.date().isoformat()}"


__all__ = ["session_label"]
