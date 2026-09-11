"""Unit tests for the Note domain value (ADR-0065, CONTEXT: Exercise Note / Set Note).

A note is optional, user-authored free text — an **Exercise Note** on the plan and a
**Set Note** on the record. This module pins the one write-boundary sanitizer,
:func:`parse_note`: blank normalizes to unset (NULL, never an empty string), an over-long
note is rejected (never truncated), and every stored note is HTML-escaped so a pasted
``<script>`` is inert wherever it renders (the nonce-CSP DOM-XSS posture, ADR-0036).
"""

from __future__ import annotations

import pytest

from app.domain.note import (
    MAX_NOTE_LENGTH,
    NoteTooLongError,
    parse_note,
)


def test_parse_none_is_none() -> None:
    # An absent note is unset — stored NULL, not coerced to an empty string.
    assert parse_note(None) is None


def test_parse_blank_is_none() -> None:
    # A whitespace-only note is "no note", normalized to unset so a blank stays honestly NULL.
    assert parse_note("") is None
    assert parse_note("   \n\t ") is None


def test_parse_strips_surrounding_whitespace() -> None:
    # Surrounding whitespace is trimmed; the interior of the cue is preserved verbatim.
    assert parse_note("  pause on the chest  ") == "pause on the chest"


def test_parse_preserves_a_plain_note_unchanged() -> None:
    # A note with no markup round-trips exactly — escaping only touches HTML-significant chars.
    assert parse_note("left knee twinge") == "left knee twinge"


def test_parse_html_escapes_markup_so_it_cannot_inject() -> None:
    # The security invariant: a pasted string with markup is stored inert. ``<`` / ``>`` /
    # ``&`` / quotes all become entities so the value can never open a tag when rendered.
    escaped = parse_note('<script>alert("x")</script>')
    assert "<script>" not in escaped
    assert escaped == "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"


def test_parse_escapes_ampersand_and_single_quote() -> None:
    # ``&`` is escaped first (so no double-escape) and the single quote is escaped too, matching
    # ``html.escape(quote=True)`` — the exact inverse the frontend note view decodes.
    assert parse_note("bench & squat") == "bench &amp; squat"
    assert parse_note("don't lock out") == "don&#x27;t lock out"


def test_parse_accepts_a_note_at_the_cap() -> None:
    # A note exactly at the cap is allowed — the boundary is inclusive.
    note = "a" * MAX_NOTE_LENGTH
    assert parse_note(note) == note


def test_parse_rejects_an_over_long_note_rather_than_truncating() -> None:
    # Over the cap is a clear boundary error (422 upstream), never a silently truncated cue.
    with pytest.raises(NoteTooLongError):
        parse_note("a" * (MAX_NOTE_LENGTH + 1))


def test_over_length_is_measured_on_the_raw_text_not_the_escaped_expansion() -> None:
    # The cap counts the user's typed characters, so a note full of ``<`` (which each expand to
    # 4 chars when escaped) is judged by what the user wrote, not the escaped length.
    note = "<" * MAX_NOTE_LENGTH
    assert parse_note(note) == "&lt;" * MAX_NOTE_LENGTH


def test_note_too_long_error_is_a_value_error() -> None:
    # NoteTooLongError subclasses ValueError so a Pydantic boundary turns it into a 422.
    assert issubclass(NoteTooLongError, ValueError)
