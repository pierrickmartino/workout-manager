"""The Profile progress read model (F5 Slice 1): the honest projection behind the
Profile view screen — the weekly Streak and lifetime Total Sessions / Total Sets,
drawn straight from the *record* side with no stored counters (ADR-0018).

``profile_progress`` reads the user's Logged Sessions once and projects them onto a
single ``ProfileProgress`` DTO. These tests feed a constructed history through the
in-memory repository and assert the projected figures; a user who has logged nothing
projects to all zeros, never an error. Exercised with the in-memory Logged-Session
repository, mirroring ``test_analytics.py``.

The read model also projects the **Effective Fitness Level** per Training Type
(ADR-0112), which is why it takes the Declared levels as a second input: the rule is
Declared *plus* notches, so this one projection is not a function of the record alone.
Those cases are the last block below."""

from __future__ import annotations

from datetime import date, timedelta

from app.domain.completion import CompletionOutcome
from app.domain.effort import HIGH_EFFORT_MIN
from app.domain.exercise import Provenance
from app.domain.experience import PER_SET_XP, SESSION_XP, operator_level
from app.domain.fitness_profile import DEFAULT_STRONG_SESSIONS_PER_LEVEL
from app.domain.progression import LOW_EFFORT_MAX
from app.logbook.profile_progress import FitnessLevelStanding, profile_progress
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
from tests.quantities import reps_quantity

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


def _log(
    sessions,
    logged,
    user,
    performed_on,
    set_count,
    *,
    training_type="strength",
    outcome=None,
    effort=None,
):
    """Record one performance. ``outcome`` and ``effort`` are the two signals the
    Effective Fitness Level reads (ADR-0112); both default to unrecorded, which is what
    the older cases below want — a Session the fold counts but reads no evidence from."""

    session_view = sessions.create(
        user,
        SessionDraft(
            training_type=training_type, duration_minutes=45, prescriptions=[]
        ),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            # Restated on the record, as the log service does for a plan-backed write:
            # every Logged Session declares its own Training Type (GLOSSARY: Training
            # Type), and the Effective level reads it off the record, never off the plan.
            training_type=training_type,
            performed_on=performed_on,
            completion_outcome=outcome,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=SQUAT,
                    quantity=reps_quantity(5),
                    perceived_difficulty=effort,
                )
                for _ in range(set_count)
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
    progress = profile_progress(
        "user_a", logged=logged, declared_levels={}, today=TODAY
    )

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
    progress = profile_progress(
        "user_c", logged=logged, declared_levels={}, today=TODAY
    )

    # Assert — XP is the sessions+sets projection and the level is derived from it
    expected_xp = 3 * SESSION_XP + 6 * PER_SET_XP
    assert progress.xp == expected_xp
    assert progress.level == operator_level(expected_xp)


def test_empty_user_projects_to_all_zeros():
    # Arrange — a brand-new user with no logged history
    _, logged = _build()

    # Act
    progress = profile_progress(
        "newcomer", logged=logged, declared_levels={}, today=TODAY
    )

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
    progress = profile_progress(
        "user_b", logged=logged, declared_levels={}, today=TODAY
    )

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
    progress = profile_progress(
        "mine", logged=logged, declared_levels={}, today=TODAY
    )

    # Assert — only the owner's sessions are projected
    assert progress.total_sessions == 1
    assert progress.total_sets == 3


def test_plan_less_session_earns_xp_and_counts_toward_the_streak():
    # Arrange — a plan-less run (no Session, its own training type) alongside a plan-backed
    # session in the same week (ADR-0031): both are training-type-blind record projections
    sessions, logged = _build()
    _log(sessions, logged, "hybrid", date(2026, 7, 8), 3)  # plan-backed, this week
    logged.create(
        "hybrid",
        LoggedSessionDraft(
            session_id=None,
            training_type="cardio",
            performed_on=date(2026, 7, 1),  # last week
            logged_sets=[LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
        ),
    )

    # Act
    progress = profile_progress(
        "hybrid", logged=logged, declared_levels={}, today=TODAY
    )

    # Assert — the plan-less run counts exactly like a plan-backed one
    assert progress.total_sessions == 2
    assert progress.total_sets == 4
    assert progress.streak == 2
    assert progress.xp == 2 * SESSION_XP + 4 * PER_SET_XP


def _achievement(progress, achievement_id):
    return next(a for a in progress.achievements if a.id == achievement_id)


def test_projects_the_achievement_wall_over_the_record():
    # Arrange — five Logged Sessions across five consecutive weeks
    sessions, logged = _build()
    for week in range(5):
        _log(sessions, logged, "user_d", date(2026, 6, 1) + timedelta(weeks=week), 1)

    # Act
    progress = profile_progress(
        "user_d", logged=logged, declared_levels={}, today=TODAY
    )

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
    progress = profile_progress(
        "newcomer", logged=logged, declared_levels={}, today=TODAY
    )

    # Assert — the whole catalog is present and every badge is locked at 0, no error
    assert len(progress.achievements) > 0
    assert all(not a.unlocked and a.current == 0 for a in progress.achievements)


# --- the Effective Fitness Level standing (ADR-0112, #606) ---
#
# The read model's one input that is not the record: the Declared levels. Every case
# here drives the *whole* read model rather than the fold it delegates to — the fold's
# own rule is pinned exhaustively in ``test_profile_domain.py``. What these assert is the
# wiring and the projected shape: which Training Types earn a standing, that the equal
# case is a present row rather than an absent one, and that an edit to the Declared level
# is re-derived rather than accumulated.

# One notch's worth of comfortable Sessions at the default cadence.
_PER_NOTCH = DEFAULT_STRONG_SESSIONS_PER_LEVEL


def _log_comfortable(sessions, logged, user, count, *, training_type="strength"):
    """``count`` Completed Sessions whose every rated set sat at low Effort."""

    for index in range(count):
        _log(
            sessions,
            logged,
            user,
            date(2026, 7, 8) - timedelta(days=index),
            1,
            training_type=training_type,
            outcome=CompletionOutcome.COMPLETED.value,
            effort=LOW_EFFORT_MAX,
        )


def test_projects_the_effective_level_against_the_declared_one_per_training_type():
    # Arrange — a notch's worth of comfortable strength work; yoga is declared but untrained
    sessions, logged = _build()
    _log_comfortable(sessions, logged, "climber", _PER_NOTCH)

    # Act
    progress = profile_progress(
        "climber",
        logged=logged,
        declared_levels={"strength": 5, "yoga": 2},
        today=TODAY,
    )

    # Assert — the earned notch rides on the strength standing; yoga reads at its floor
    assert progress.fitness_levels == [
        FitnessLevelStanding(training_type="strength", declared=5, effective=6),
        FitnessLevelStanding(training_type="yoga", declared=2, effective=2),
    ]


def test_the_equal_case_is_a_present_standing_not_an_absent_one():
    # Arrange — a user who has declared two levels and logged nothing at all
    _, logged = _build()

    # Act
    progress = profile_progress(
        "newcomer",
        logged=logged,
        declared_levels={"strength": 4, "cardio": 6},
        today=TODAY,
    )

    # Assert — both types read at exactly their Declared level, and both are *rendered*:
    # "we read your record and found no change" is not the same message as a blank
    assert progress.fitness_levels == [
        FitnessLevelStanding(training_type="cardio", declared=6, effective=6),
        FitnessLevelStanding(training_type="strength", declared=4, effective=4),
    ]


def test_standings_are_ordered_by_training_type_not_by_the_stored_mapping():
    # Arrange — a Declared mapping whose insertion order is the reverse of its sort order
    _, logged = _build()

    # Act
    progress = profile_progress(
        "ordered",
        logged=logged,
        declared_levels={"yoga": 2, "strength": 5, "cardio": 3},
        today=TODAY,
    )

    # Assert — a deterministic wire order, so the shape never depends on how the profile
    # happened to be saved; the curated display order is the web view-model's business
    assert [standing.training_type for standing in progress.fitness_levels] == [
        "cardio",
        "strength",
        "yoga",
    ]


def test_a_logged_training_type_the_user_never_declared_earns_no_standing():
    # Arrange — a notch's worth of comfortable cardio, but cardio was never declared
    sessions, logged = _build()
    _log_comfortable(sessions, logged, "undeclared", _PER_NOTCH, training_type="cardio")

    # Act
    progress = profile_progress(
        "undeclared", logged=logged, declared_levels={"strength": 5}, today=TODAY
    )

    # Assert — the Declared level is the floor the Effective one is read against, so a
    # type with no declared floor has no standing to show
    assert [standing.training_type for standing in progress.fitness_levels] == [
        "strength"
    ]


def test_editing_the_declared_level_re_derives_the_standing_keeping_earned_evidence():
    # Arrange — one history, read twice at two different Declared levels
    sessions, logged = _build()
    _log_comfortable(sessions, logged, "editor", _PER_NOTCH)

    # Act
    before = profile_progress(
        "editor", logged=logged, declared_levels={"strength": 5}, today=TODAY
    )
    after = profile_progress(
        "editor", logged=logged, declared_levels={"strength": 7}, today=TODAY
    )

    # Assert — the earned notch rides on top of whatever the user now declares; it is
    # re-derived from the record, never accumulated onto the previous reading
    assert (before.fitness_levels[0].declared, before.fitness_levels[0].effective) == (
        5,
        6,
    )
    assert (after.fitness_levels[0].declared, after.fitness_levels[0].effective) == (
        7,
        8,
    )


def test_strained_sessions_withdraw_credit_without_breaching_the_declared_floor():
    # Arrange — a notch's worth of comfortable work, cancelled by as many ground-out ones
    sessions, logged = _build()
    _log_comfortable(sessions, logged, "detrained", _PER_NOTCH)
    for index in range(_PER_NOTCH):
        _log(
            sessions,
            logged,
            "detrained",
            date(2026, 7, 8) - timedelta(days=index),
            1,
            outcome=CompletionOutcome.COMPLETED.value,
            effort=HIGH_EFFORT_MIN,
        )

    # Act
    progress = profile_progress(
        "detrained", logged=logged, declared_levels={"strength": 5}, today=TODAY
    )

    # Assert — net evidence is nil, and the Declared level is a floor the read never breaches
    assert progress.fitness_levels == [
        FitnessLevelStanding(training_type="strength", declared=5, effective=5)
    ]
