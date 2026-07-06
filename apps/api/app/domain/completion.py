"""Completion Outcome domain rules (ADR-0013).

A Logged Session carries a **Completion Outcome** — ``Completed`` when every
prescribed set of the Session was attempted (regardless of reps or load achieved,
so a zero-rep set ground to failure still counts as attempted) or ``Incomplete``
when some prescribed set was left un-attempted (CONTEXT.md). It is the first domain
verdict the *client* asserts rather than the server deriving (ADR-0013), because a
server can only see logged sets and would punish honest under-logging.

Only a ``Completed`` log advances a Protocol to its Next Session; an ``Incomplete``
one leaves that Session as next. ``CompletionOutcome`` fixes the allowed values;
``parse_completion_outcome`` validates untrusted client input at the boundary."""

from __future__ import annotations

from enum import Enum


class CompletionOutcome(str, Enum):
    """Whether a Logged Session attempted every prescribed set."""

    COMPLETED = "completed"
    INCOMPLETE = "incomplete"


def parse_completion_outcome(value: str) -> CompletionOutcome:
    """Coerce client input to a ``CompletionOutcome``, normalizing case/whitespace.

    Raises ``ValueError`` for anything outside the vocabulary (e.g. "failed",
    "partial") so a malformed outcome never reaches storage.
    """

    try:
        return CompletionOutcome(value.strip().lower())
    except ValueError as exc:
        raise ValueError(f"unknown completion outcome: {value!r}") from exc
