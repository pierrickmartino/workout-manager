"""The Profile progress read model (F5 Slice 1): the honest projection behind the
Profile view screen — the weekly Streak and lifetime Total Sessions / Total Sets,
drawn straight from the *record* side with no stored counters (ADR-0018).

``profile_progress`` reads the user's Logged Sessions once and projects them onto a
single ``ProfileProgress`` DTO. These tests feed a constructed history through the
in-memory repository and assert the projected figures; a user who has logged nothing
projects to all zeros, never an error. Exercised with the in-memory Logged-Session
repository, mirroring ``test_analytics.py``."""

from __future__ import annotations

from tests.quantities import reps_quantity

from datetime import date, timedelta

from app.domain.exercise import Provenance
from app.domain.experience import PER_SET_XP, SESSION_XP, operator_level, total_xp
from app.logbook.profile_progress import profile_progress
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)

SQUAT = 1
# A Wednesday; its ISO week runs Mon 2026-07-06 .. Sun 2026-07-12.
TODAY = date(2026, 7, 8)


def _build():
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
    )
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return sessions, logged


def _log(sessions, logged, user, performed_on, set_count):
    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[
                LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)) for _ in range(set_count)
            ],
        ),
    )


def test_projects_streak_and_lifetime_counts_together():
    # Arrange — three sessions across the current and two prior weeks, 3 + 2 + 1 sets
    sessions, logged = _build()
    _log(sessions, logged, "user_a", date(2026, 7, 8), 3)  # this week
    _log(sessions, logged, "user_a", date(2026, 7, 1), 2)  # last week
    _log(sessions, logged, "user_a", date(2026, 6, 24), 1)  # two weeks ago

    # Act
    progress = profile_progress("user_a", logged=logged, today=TODAY)

    # Assert — a three-week streak, three all-time sessions, six all-time sets
    assert progress.streak == 3
    assert progress.total_sessions == 3
    assert progress.total_sets == 6


def test_projects_xp_and_operator_level_from_the_record():
    # Arrange — three sessions of 3 + 2 + 1 attempted sets
    sessions, logged = _build()
    _log(sessions, logged, "user_c", date(2026, 7, 8), 3)
    _log(sessions, logged, "user_c", date(2026, 7, 1), 2)
    _log(sessions, logged, "user_c", date(2026, 6, 24), 1)

    # Act
    progress = profile_progress("user_c", logged=logged, today=TODAY)

    # Assert — XP is the sessions+sets projection and the level is derived from it
    expected_xp = 3 * SESSION_XP + 6 * PER_SET_XP
    assert progress.xp == expected_xp
    assert progress.level == operator_level(expected_xp)


def test_empty_user_projects_to_all_zeros():
    # Arrange — a brand-new user with no logged history
    _, logged = _build()

    # Act
    progress = profile_progress("newcomer", logged=logged, today=TODAY)

    # Assert — sensible zero states, not an error; zero XP maps to Level 1
    assert progress.streak == 0
    assert progress.total_sessions == 0
    assert progress.total_sets == 0
    assert progress.xp == 0
    assert progress.level == operator_level(0)
    assert progress.level.level == 1


def test_lifetime_counts_are_all_time_not_windowed():
    # Arrange — a session long ago (a broken streak) still counts toward lifetime totals
    sessions, logged = _build()
    _log(sessions, logged, "user_b", date(2026, 7, 8), 2)  # this week
    _log(sessions, logged, "user_b", date(2025, 1, 1), 4)  # over a year ago

    # Act
    progress = profile_progress("user_b", logged=logged, today=TODAY)

    # Assert — the stale session is outside the streak but inside the lifetime totals
    assert progress.streak == 1
    assert progress.total_sessions == 2
    assert progress.total_sets == 6


def test_projection_is_scoped_to_the_owning_user():
    # Arrange — two users, each with their own history
    sessions, logged = _build()
    _log(sessions, logged, "mine", date(2026, 7, 8), 3)
    _log(sessions, logged, "theirs", date(2026, 7, 8), 9)

    # Act
    progress = profile_progress("mine", logged=logged, today=TODAY)

    # Assert — only the owner's sessions are projected
    assert progress.total_sessions == 1
    assert progress.total_sets == 3


def _achievement(progress, achievement_id):
    return next(a for a in progress.achievements if a.id == achievement_id)


def test_projects_the_achievement_wall_over_the_record():
    # Arrange — five Logged Sessions across five consecutive weeks
    sessions, logged = _build()
    for week in range(5):
        _log(sessions, logged, "user_d", date(2026, 6, 1) + timedelta(weeks=week), 1)

    # Act
    progress = profile_progress("user_d", logged=logged, today=TODAY)

    # Assert — the wall rides on the same read model: the 5-session and 4-week badges
    # unlock, the 25-session one shows live progress
    assert _achievement(progress, "sessions-5").unlocked is True
    assert _achievement(progress, "streak-4").unlocked is True
    twenty_five = _achievement(progress, "sessions-25")
    assert twenty_five.unlocked is False
    assert (twenty_five.current, twenty_five.target) == (5, 25)


def test_empty_user_projects_an_all_locked_wall():
    # Arrange — a brand-new user
    _, logged = _build()

    # Act
    progress = profile_progress("newcomer", logged=logged, today=TODAY)

    # Assert — the whole catalog is present and every badge is locked at 0, no error
    assert len(progress.achievements) > 0
    assert all(not a.unlocked and a.current == 0 for a in progress.achievements)
