"""The Completion Outcome value at the write boundary (ADR-0013).

A Logged Session's Completion Outcome is **client-declared** — the client asserts
whether every prescribed set was attempted (``completed``) or some was left undone
(``incomplete``). ``parse_completion_outcome`` fixes the vocabulary so a malformed
value never reaches storage, mirroring how ``parse_verdict`` guards feedback."""

from __future__ import annotations

import pytest

from app.domain.completion import CompletionOutcome, parse_completion_outcome


def test_parses_the_two_known_outcomes():
    # Arrange / Act / Assert — both domain values round-trip from client text
    assert parse_completion_outcome("completed") is CompletionOutcome.COMPLETED
    assert parse_completion_outcome("incomplete") is CompletionOutcome.INCOMPLETE


def test_normalizes_case_and_surrounding_whitespace():
    # Arrange / Act / Assert — untrusted input is trimmed and lower-cased
    assert parse_completion_outcome("  COMPLETED ") is CompletionOutcome.COMPLETED


def test_rejects_a_value_outside_the_vocabulary():
    # Arrange / Act / Assert — "failed"/"partial" are not the domain terms
    with pytest.raises(ValueError):
        parse_completion_outcome("failed")
