"""Generation Feedback domain rules: the verdict vocabulary.

A Generation Feedback is a binary verdict on a generated/adopted Session — "did
the AI give me a good plan?" (CONTEXT.md). ``Verdict`` fixes the two allowed
values and ``parse_verdict`` is the boundary that turns untrusted client input
into one of them, rejecting anything else."""

from __future__ import annotations

import pytest

from app.domain.feedback import Verdict, parse_verdict


def test_verdict_values_are_positive_and_negative():
    # Assert — the two allowed verdicts and their wire values
    assert Verdict.POSITIVE.value == "positive"
    assert Verdict.NEGATIVE.value == "negative"


def test_parse_verdict_accepts_the_canonical_values():
    # Act / Assert
    assert parse_verdict("positive") is Verdict.POSITIVE
    assert parse_verdict("negative") is Verdict.NEGATIVE


def test_parse_verdict_is_case_and_whitespace_insensitive():
    # Act / Assert — client input is normalized before matching
    assert parse_verdict("  Positive ") is Verdict.POSITIVE
    assert parse_verdict("NEGATIVE") is Verdict.NEGATIVE


def test_parse_verdict_rejects_an_unknown_value():
    # Act / Assert — anything outside the vocabulary fails fast
    with pytest.raises(ValueError):
        parse_verdict("meh")
