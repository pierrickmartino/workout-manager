"""Behavior of the Readiness domain module: the qualitative three-state signal
shown on Home (ADR-0008). It is a pure function over a Fitness Profile and the
user's Logged Sessions — a Sensitive Constraint forces Extra Caution, a
Preference / Limitation or a recently hard performance yields Caution, and
everything else is Ready. No mocks: the inputs are plain stubs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.domain.readiness import Readiness, assess_readiness


@dataclass
class _Profile:
    """Minimal stand-in carrying only what ``assess_readiness`` reads."""

    preferences: list[str] = field(default_factory=list)
    sensitive_constraints: list[str] = field(default_factory=list)


@dataclass
class _Set:
    """Minimal stand-in for one performed set's difficulty signal."""

    perceived_difficulty: int | None = None


@dataclass
class _Session:
    """Minimal stand-in for a Logged Session: when it was done and how it felt."""

    performed_on: date
    logged_sets: list[_Set] = field(default_factory=list)


def test_ready_with_no_constraints_and_no_history():
    # Arrange — a clean profile and nothing ever logged
    profile = _Profile()

    # Act
    result = assess_readiness(profile, [])

    # Assert — nothing to caution against
    assert result is Readiness.READY


def test_sensitive_constraint_forces_extra_caution():
    # Arrange — a profile carrying a Sensitive Constraint
    profile = _Profile(sensitive_constraints=["injury"])

    # Act
    result = assess_readiness(profile, [])

    # Assert
    assert result is Readiness.EXTRA_CAUTION


def test_extra_caution_wins_over_a_preference_and_a_recent_hard_session():
    # Arrange — a sensitive profile that ALSO has a preference and just trained hard
    profile = _Profile(
        sensitive_constraints=["postpartum"], preferences=["no running"]
    )
    sessions = [
        _Session(
            performed_on=date(2026, 6, 1),
            logged_sets=[_Set(perceived_difficulty=10)],
        )
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — the top of the precedence ladder wins outright
    assert result is Readiness.EXTRA_CAUTION


def test_a_preference_alone_yields_caution():
    # Arrange — a non-medical Preference / Limitation, nothing logged
    profile = _Profile(preferences=["no jumping in the apartment"])

    # Act
    result = assess_readiness(profile, [])

    # Assert
    assert result is Readiness.CAUTION


def test_a_recent_hard_session_yields_caution_without_any_preference():
    # Arrange — no constraints, but the last session's mean difficulty was > 8
    profile = _Profile()
    sessions = [
        _Session(
            performed_on=date(2026, 6, 1),
            logged_sets=[_Set(perceived_difficulty=9), _Set(perceived_difficulty=9)],
        )
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — a hard recent performance alone is enough
    assert result is Readiness.CAUTION


def test_a_mean_of_exactly_eight_is_not_hard():
    # Arrange — sets averaging exactly 8 (7 and 9): the boundary is a strict >
    profile = _Profile()
    sessions = [
        _Session(
            performed_on=date(2026, 6, 1),
            logged_sets=[_Set(perceived_difficulty=7), _Set(perceived_difficulty=9)],
        )
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — exactly at the threshold does not trip Caution
    assert result is Readiness.READY


def test_a_mean_just_over_eight_is_hard():
    # Arrange — sets averaging 8.5 (8 and 9): just past the threshold
    profile = _Profile()
    sessions = [
        _Session(
            performed_on=date(2026, 6, 1),
            logged_sets=[_Set(perceived_difficulty=8), _Set(perceived_difficulty=9)],
        )
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — crossing the threshold trips Caution
    assert result is Readiness.CAUTION


def test_only_the_most_recent_session_governs_when_it_is_easy():
    # Arrange — an old hard session, but the LATEST performed_on was easy
    profile = _Profile()
    sessions = [
        _Session(
            performed_on=date(2026, 1, 1),
            logged_sets=[_Set(perceived_difficulty=10)],
        ),
        _Session(
            performed_on=date(2026, 6, 1),
            logged_sets=[_Set(perceived_difficulty=5)],
        ),
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — recency by performed_on, not list order: the easy latest one wins
    assert result is Readiness.READY


def test_a_stale_hard_session_still_yields_caution():
    # Arrange — the most recent session is old, but it was hard; nothing since
    profile = _Profile()
    sessions = [
        _Session(
            performed_on=date(2020, 1, 1),
            logged_sets=[_Set(perceived_difficulty=10)],
        )
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — no recovery clock: an old hard session still cautions (ADR-0001)
    assert result is Readiness.CAUTION


def test_null_perceived_difficulty_values_are_not_hard():
    # Arrange — the most recent session was logged without any effort ratings
    profile = _Profile()
    sessions = [
        _Session(
            performed_on=date(2026, 6, 1),
            logged_sets=[_Set(perceived_difficulty=None), _Set(perceived_difficulty=None)],
        )
    ]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — with no recorded difficulty there is no evidence of a hard session
    assert result is Readiness.READY


def test_a_session_with_no_sets_is_not_hard():
    # Arrange — a logged session that recorded no sets at all
    profile = _Profile()
    sessions = [_Session(performed_on=date(2026, 6, 1), logged_sets=[])]

    # Act
    result = assess_readiness(profile, sessions)

    # Assert — nothing to judge; not hard
    assert result is Readiness.READY
