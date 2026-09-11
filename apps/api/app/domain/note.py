"""The Note domain value — free-text annotations sanitized at the write boundary (ADR-0065).

Two nullable notes layer onto the plan/record split: an **Exercise Note** on an
``ExercisePrescription`` (a plan-side coaching cue — "pause on the chest") and a **Set Note**
on a ``LoggedSet`` (a record-side remark — "left knee twinge"). Both are optional so logging
stays fast, and both are **user-authored free text that renders in the UI**, so this module
is the one write-boundary that makes an incoming note safe to store and echo:

- **length-capped** at :data:`MAX_NOTE_LENGTH` characters — measured on the user's *raw* text,
  before escaping expands it — rejecting an over-long note rather than silently truncating a
  cue (losing the tail of a coaching cue is worse than a clear error); and
- **HTML-escaped** (``html.escape`` with quotes) so a pasted ``<script>`` is stored inert.
  This is defense-in-depth under the app-wide nonce-CSP DOM-XSS posture (ADR-0036), owned at
  the write boundary and independent of the frontend's own escaping — the stored value is safe
  wherever it is later consumed (the PWA, a CSV export, a future raw-HTML reader).

Pure — no I/O, no ORM. :func:`parse_note` is the write-boundary sanitizer, applied *once* per
user submission; carry-forward (Duplicate/Redeem/Share/Substitution) copies the already-escaped
stored value straight through, so a note is never double-escaped by being copied.
"""

from __future__ import annotations

import html

#: The maximum length of a note, measured on the user's raw text before HTML-escaping. A
#: coaching cue or a per-set remark is a sentence or two; this bounds stored free text (and the
#: rendered row width) without cramping a genuine note. An over-long note is rejected at the
#: write boundary, never truncated.
MAX_NOTE_LENGTH = 500


class NoteTooLongError(ValueError):
    """An incoming note exceeded :data:`MAX_NOTE_LENGTH` characters.

    A subclass of :class:`ValueError` so a Pydantic field validator that lets it propagate
    surfaces it as a boundary error (HTTP 422), never a 500.
    """

    def __init__(self, length: int) -> None:
        super().__init__(
            f"note must be at most {MAX_NOTE_LENGTH} characters (got {length})"
        )
        self.length = length


def parse_note(value: str | None) -> str | None:
    """Sanitize an *incoming* note to its stored value, or ``None`` for unset.

    The one place a write path turns a request note into a safe stored value:

    - ``None`` or a blank/whitespace-only note is the un-annotated default and normalizes to
      ``None`` (stored NULL — *not* an empty string, so "no note" stays honestly unset);
    - a note longer than :data:`MAX_NOTE_LENGTH` (measured on the stripped raw text) raises
      :class:`NoteTooLongError` rather than being truncated; and
    - otherwise the note is stripped of surrounding whitespace and HTML-escaped (quotes
      included) so it is inert wherever it renders (ADR-0036).

    Applied once, at the request boundary. Do not call it on a value read back from storage —
    that value is already escaped, and re-escaping would double-encode it.
    """

    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > MAX_NOTE_LENGTH:
        raise NoteTooLongError(len(stripped))
    return html.escape(stripped)


__all__ = ["MAX_NOTE_LENGTH", "NoteTooLongError", "parse_note"]
