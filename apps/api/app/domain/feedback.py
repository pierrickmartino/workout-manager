"""Generation Feedback domain rules.

A Generation Feedback is the user's binary verdict on a generated/adopted Session
— positive or negative — with an optional free-text reason; a negative verdict is
the trigger for Regeneration (CONTEXT.md). It is deliberately distinct from
Performance Feedback (perceived effort on a Logged Session/Set): never collapse
the two. ``Verdict`` fixes the allowed values; ``parse_verdict`` validates
untrusted client input at the boundary."""

from __future__ import annotations

from enum import Enum


class Verdict(str, Enum):
    """The user's verdict on a generated Session: was it a good plan?"""

    POSITIVE = "positive"
    NEGATIVE = "negative"


def parse_verdict(value: str) -> Verdict:
    """Coerce client input to a ``Verdict``, normalizing case and whitespace.

    Raises ``ValueError`` for anything outside the vocabulary so a malformed
    verdict never reaches storage.
    """

    try:
        return Verdict(value.strip().lower())
    except ValueError as exc:
        raise ValueError(f"unknown verdict: {value!r}") from exc
