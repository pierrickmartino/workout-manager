"""The shared gamification read model (issue #166): the honest projection of an
account's XP, Operator Level, and weekly Streak, composed read-time from the
existing experience + streak domain modules over a Logged-Session ``history``
(ADR-0018/0019).

``project_gamification`` is a pure function of the already-loaded history and a
reference ``today`` — no repository, no I/O — so it is the single source Home and
Profile both fan out from and can never disagree on. These tests feed a
constructed history straight in and assert the projected figures; a user who has
logged nothing projects to Level 1, an empty XP bar, and a 0-week streak."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.domain.experience import PER_SET_XP, SESSION_XP, operator_level
from app.domain.streak import current_streak
from app.logbook.gamification import GamificationSummary, project_gamification

# A Wednesday; its ISO week runs Mon 2026-07-06 .. Sun 2026-07-12.
TODAY = date(2026, 7, 8)


def _session(performed_on: date, set_count: int) -> SimpleNamespace:
    """A minimal Logged Session stand-in: only the attributes the projection
    reads — ``performed_on`` and a ``logged_sets`` list whose length is the
    attempted-set count."""

    return SimpleNamespace(
        performed_on=performed_on,
        logged_sets=list(range(set_count)),
    )


def test_projects_xp_level_and_streak_matching_the_profile_numbers():
    # Arrange — three sessions of 3 + 2 + 1 sets across three consecutive weeks
    history = [
        _session(date(2026, 7, 8), 3),  # this week
        _session(date(2026, 7, 1), 2),  # last week
        _session(date(2026, 6, 24), 1),  # two weeks ago
    ]

    # Act
    summary = project_gamification(history, today=TODAY)

    # Assert — the same figures profile_progress computes: XP is the
    # sessions+attempted-sets projection, the level derives from it, and the
    # streak is three consecutive weeks
    expected_xp = 3 * SESSION_XP + 6 * PER_SET_XP
    assert summary == GamificationSummary(
        xp=expected_xp,
        level=operator_level(expected_xp),
        streak=3,
    )


def test_empty_history_projects_to_level_one_zero_xp_and_zero_streak():
    # Arrange — a brand-new account with nothing logged
    # Act
    summary = project_gamification([], today=TODAY)

    # Assert — sensible zero state, never blank or broken
    assert summary.xp == 0
    assert summary.level == operator_level(0)
    assert summary.level.level == 1
    assert summary.streak == 0


def test_streak_counts_only_up_to_the_first_missed_week():
    # Arrange — this week and last week, then a gap, then an older run
    history = [
        _session(date(2026, 7, 8), 1),  # this week
        _session(date(2026, 7, 1), 1),  # last week
        _session(date(2026, 6, 10), 1),  # older, across a gap
    ]

    # Act
    summary = project_gamification(history, today=TODAY)

    # Assert — the streak stops at the gap even though older weeks were trained,
    # matching the domain's current_streak (ADR-0019)
    assert summary.streak == 2
    assert summary.streak == current_streak(
        [s.performed_on for s in history], TODAY
    )
