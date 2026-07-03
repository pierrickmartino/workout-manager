"""Readiness — the qualitative, three-state training signal shown on Home.

``assess_readiness`` is a pure function: given a Fitness Profile and the user's
Logged Sessions, it returns how cautiously the user should train right now. It
costs no AI call and reads nothing external.

Deliberately *not* a computed recovery percentage: the self-paced, calendar-free
plan model (ADR-0001) gives no honest "time since last workout" basis, so a
qualitative state is the honest signal (ADR-0008).
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Protocol, Sequence

from app.domain.fitness_profile import is_sensitive

# A most-recent Logged Session whose mean perceived difficulty exceeds this counts
# as "recently hard" and yields Caution. Intentionally stricter than Progression's
# ``LOW_EFFORT_MAX`` (7): Progression asks "was this easy enough to add load?",
# whereas Readiness asks "was this hard enough to train cautiously?" — the middle
# band (8) is neither, so the threshold is internal to this module and read as
# a strict ``>``.
HARD_SESSION_DIFFICULTY_MAX = 8


class Readiness(str, Enum):
    """How cautiously the user should train right now."""

    READY = "READY"
    CAUTION = "CAUTION"
    EXTRA_CAUTION = "EXTRA_CAUTION"


class _ReadinessProfile(Protocol):
    """What Readiness reads off a Fitness Profile: its two constraint fields.

    ``sensitive_constraints`` also satisfies the ``is_sensitive`` gate.
    """

    preferences: list[str]
    sensitive_constraints: list[str]


class _ReadinessSet(Protocol):
    perceived_difficulty: int | None


class _ReadinessSession(Protocol):
    performed_on: date
    logged_sets: Sequence[_ReadinessSet]


def assess_readiness(
    profile: _ReadinessProfile,
    logged_sessions: Sequence[_ReadinessSession],
) -> Readiness:
    """Return the user's current Readiness.

    Precedence (top wins):

    1. A Sensitive Constraint → ``EXTRA_CAUTION``.
    2. else a Preference / Limitation, or a most-recent Logged Session that was
       hard (mean ``perceived_difficulty`` > ``HARD_SESSION_DIFFICULTY_MAX``) →
       ``CAUTION``.
    3. else ``READY``.

    "Most recent" is by ``performed_on``. Staleness is accepted: an old hard
    session still yields Caution — there is no recovery clock (ADR-0001).
    """

    if is_sensitive(profile):
        return Readiness.EXTRA_CAUTION
    if profile.preferences or _recently_trained_hard(logged_sessions):
        return Readiness.CAUTION
    return Readiness.READY


def _recently_trained_hard(logged_sessions: Sequence[_ReadinessSession]) -> bool:
    """Whether the user's most-recent Logged Session was hard.

    Hard means the mean of its recorded perceived-difficulty values exceeds the
    threshold. Sets with no recorded difficulty do not count toward the mean; a
    session with no history and one with no rated sets are both "not hard".
    """

    if not logged_sessions:
        return False

    most_recent = max(logged_sessions, key=lambda session: session.performed_on)
    difficulties = [
        logged_set.perceived_difficulty
        for logged_set in most_recent.logged_sets
        if logged_set.perceived_difficulty is not None
    ]
    if not difficulties:
        return False

    mean_difficulty = sum(difficulties) / len(difficulties)
    return mean_difficulty > HARD_SESSION_DIFFICULTY_MAX
