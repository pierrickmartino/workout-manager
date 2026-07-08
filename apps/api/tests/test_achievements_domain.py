"""Behavior of the Achievements domain module (F5 Slice 3): the curated, type-neutral
catalog of milestones projected read-time over the user's Logged history (ADR-0018/0019).

Every Achievement is a pure predicate over the *record* side — "unlocked" iff it holds
over the whole current history, with ``unlocked_on`` recovered as the earliest replay
point it first held, and live ``current``/``target`` progress while locked. Because it is
a projection of current logs, a badge re-locks when the logs behind it are deleted. The
catalog is deliberately type-neutral, so a non-strength history still unlocks the neutral
milestones. No mocks: the inputs are plain stubs, mirroring ``test_muscle_groups.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.domain.achievements import CATALOG, Achievement, evaluate_achievements
from app.domain.load import LoadKind, ParsedLoad

SQUAT = 1
_WEEK = timedelta(days=7)


@dataclass
class _Set:
    """Minimal stand-in for a Logged Set: the fields the catalog metrics read."""

    exercise_id: int = SQUAT
    exercise_name: str = "Back Squat"
    reps: int = 5
    load: dict | None = None
    targeted_muscles: list[str] = field(default_factory=list)


@dataclass
class _Session:
    """Minimal stand-in for a Logged Session: its date and its ordered Logged Sets."""

    performed_on: date
    logged_sets: list[_Set] = field(default_factory=list)


def _absolute(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load — enough to set a PR."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _sessions_on(dates: list[date], *, sets_each: int = 1) -> list[_Session]:
    """One Logged Session per date, each with ``sets_each`` plain bodyweight sets."""

    return [
        _Session(performed_on=day, logged_sets=[_Set() for _ in range(sets_each)])
        for day in dates
    ]


def _by_id(achievements: list[Achievement]) -> dict[str, Achievement]:
    return {achievement.id: achievement for achievement in achievements}


def test_a_threshold_flips_from_locked_to_unlocked_when_its_target_is_met():
    # Arrange — exactly five Logged Sessions, one per day
    history = _sessions_on([date(2026, 6, 1) + timedelta(days=i) for i in range(5)])

    # Act
    result = _by_id(evaluate_achievements(history))

    # Assert — the 5-session badge unlocks; the 25-session one is still locked
    assert result["sessions-5"].unlocked is True
    assert result["sessions-25"].unlocked is False


def test_a_locked_threshold_reports_live_progress_toward_its_target():
    # Arrange — 18 sessions: past the 5 badge, short of the 25 badge
    history = _sessions_on([date(2026, 1, 1) + timedelta(days=i) for i in range(18)])

    # Act
    twenty_five = _by_id(evaluate_achievements(history))["sessions-25"]

    # Assert — the honest "18/25" a locked badge renders
    assert twenty_five.unlocked is False
    assert twenty_five.current == 18
    assert twenty_five.target == 25
    assert twenty_five.unlocked_on is None


def test_unlocked_on_is_the_earliest_date_the_predicate_first_held():
    # Arrange — the fifth session (which trips the 5-session badge) is on a known date,
    # with later sessions after it that must not move the unlock date
    dates = [date(2026, 6, 1) + timedelta(days=i) for i in range(8)]
    history = _sessions_on(dates)

    # Act
    five = _by_id(evaluate_achievements(history))["sessions-5"]

    # Assert — unlocked on the day the fifth session landed, not the latest session
    assert five.unlocked is True
    assert five.unlocked_on == dates[4]


def test_unlocked_on_is_recovered_even_when_history_is_out_of_order():
    # Arrange — the same five sessions fed newest-first (as the repository returns them)
    dates = [date(2026, 6, 1) + timedelta(days=i) for i in range(5)]
    history = _sessions_on(list(reversed(dates)))

    # Act — the replay must sort chronologically to find the earliest qualifying date
    five = _by_id(evaluate_achievements(history))["sessions-5"]

    # Assert
    assert five.unlocked_on == dates[4]


def test_an_achievement_relocks_when_the_logs_behind_it_are_deleted():
    # Arrange — five sessions unlock the 5-session badge...
    dates = [date(2026, 6, 1) + timedelta(days=i) for i in range(5)]
    unlocked = _by_id(evaluate_achievements(_sessions_on(dates)))["sessions-5"]
    assert unlocked.unlocked is True

    # Act — ...then two are deleted, leaving three (a pure re-read of current logs)
    relocked = _by_id(evaluate_achievements(_sessions_on(dates[:3])))["sessions-5"]

    # Assert — the badge re-locks with honest progress; no stored high-water mark
    assert relocked.unlocked is False
    assert relocked.current == 3
    assert relocked.unlocked_on is None


def test_streak_milestone_unlocks_from_a_run_of_consecutive_weeks():
    # Arrange — one session a week for four consecutive weeks
    start = date(2026, 3, 2)  # a Monday
    history = _sessions_on([start + i * _WEEK for i in range(4)])

    # Act
    result = _by_id(evaluate_achievements(history))

    # Assert — the 4-week streak badge unlocks on the fourth week; the 12 stays locked
    assert result["streak-4"].unlocked is True
    assert result["streak-4"].unlocked_on == start + 3 * _WEEK
    assert result["streak-12"].unlocked is False
    assert result["streak-12"].current == 4


def test_a_brand_new_user_sees_every_badge_locked_at_zero_with_no_error():
    # Arrange — no history at all
    # Act
    achievements = evaluate_achievements([])

    # Assert — the whole catalog, every badge locked at 0 progress, none dated
    assert len(achievements) == len(CATALOG)
    assert all(not achievement.unlocked for achievement in achievements)
    assert all(achievement.current == 0 for achievement in achievements)
    assert all(achievement.unlocked_on is None for achievement in achievements)


def test_a_non_strength_history_still_unlocks_the_type_neutral_milestones():
    # Arrange — five yoga/mobility Sessions across five weeks, purely bodyweight (no
    # absolute loads, so nothing can set a Personal Record), each targeting muscles
    start = date(2026, 4, 6)  # a Monday
    history = [
        _Session(
            performed_on=start + i * _WEEK,
            logged_sets=[
                _Set(exercise_name="Sun Salutation", targeted_muscles=["core"])
            ],
        )
        for i in range(5)
    ]

    # Act
    result = _by_id(evaluate_achievements(history))

    # Assert — the type-neutral milestones unlock; the strength-shaped one does not
    assert result["sessions-5"].unlocked is True
    assert result["streak-4"].unlocked is True
    assert result["first-pr"].unlocked is False


def test_full_muscle_coverage_unlocks_only_once_all_six_groups_are_trained():
    # Arrange — a single session touching all six real Muscle Groups at once
    six = _Session(
        performed_on=date(2026, 5, 1),
        logged_sets=[
            _Set(targeted_muscles=["quadriceps"]),
            _Set(targeted_muscles=["chest"]),
            _Set(targeted_muscles=["lats"]),
            _Set(targeted_muscles=["deltoids"]),
            _Set(targeted_muscles=["biceps"]),
            _Set(targeted_muscles=["abs"]),
        ],
    )

    # Act — full coverage against a five-group history that must fall short
    full = _by_id(evaluate_achievements([six]))["muscle-all"]
    partial = _by_id(
        evaluate_achievements(
            [
                _Session(
                    performed_on=date(2026, 5, 1),
                    logged_sets=[
                        _Set(targeted_muscles=["quadriceps"]),
                        _Set(targeted_muscles=["chest"]),
                        _Set(targeted_muscles=["lats"]),
                        _Set(targeted_muscles=["deltoids"]),
                        _Set(targeted_muscles=["biceps"]),
                    ],
                )
            ]
        )
    )["muscle-all"]

    # Assert
    assert full.unlocked is True
    assert full.current == 6
    assert partial.unlocked is False
    assert partial.current == 5


def test_first_personal_record_unlocks_from_an_absolute_load_lift():
    # Arrange — one heavy absolute-load Squat set: the first such set always sets a PR
    history = [
        _Session(
            performed_on=date(2026, 6, 10),
            logged_sets=[_Set(load=_absolute(100.0), reps=3)],
        )
    ]

    # Act
    first_pr = _by_id(evaluate_achievements(history))["first-pr"]

    # Assert — unlocked, dated on the day the record was set
    assert first_pr.unlocked is True
    assert first_pr.unlocked_on == date(2026, 6, 10)


def test_progress_can_exceed_a_met_target_without_capping():
    # Arrange — thirty sessions, well past the 25-session badge
    history = _sessions_on([date(2026, 1, 1) + timedelta(days=i) for i in range(30)])

    # Act
    twenty_five = _by_id(evaluate_achievements(history))["sessions-25"]

    # Assert — current is the honest raw count, not clamped to the target
    assert twenty_five.unlocked is True
    assert twenty_five.current == 30
