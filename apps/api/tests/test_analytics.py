"""The count read model behind the Analytics screen (F3 Slice 1): honest,
range-scoped counts drawn straight from the *record* side — Logged Sessions and
Logged Sets — with no Load parsing, Estimated 1RM, or conversion.

``analytics_overview`` reads the user's Logged Sessions, keeps only those
performed inside the selected rolling window ending on a reference ``today``, and
reports the counts — sessions, active days (distinct ``performed_on``), total sets
— plus the set-count muscle distribution over the six curated Muscle Groups. It is
read-only over the record side — no plan is touched, no AI runs — and scoped to the
owning user. Exercised with the in-memory Logged-Session repository."""

from __future__ import annotations

from datetime import date, timedelta

from app.domain.exercise import Provenance
from app.domain.muscle_groups import MuscleGroup
from app.logbook.analytics import AnalyticsRange, analytics_overview
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
PRESS = 2
TODAY = date(2026, 7, 5)


def _build():
    exercises = InMemoryExerciseRepository()
    # Back Squat (id 1) is a Legs movement; Overhead Press (id 2) trains Shoulders
    # and Arms — enough spread to exercise the muscle distribution roll-up.
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
    )
    exercises.find_or_create(
        "Overhead Press",
        provenance=Provenance.CURATED,
        targeted_muscles=["shoulders", "triceps"],
    )
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, sessions, logged


def _log(sessions, logged, user, performed_on, sets):
    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=sets,
        ),
    )


def test_counts_sessions_active_days_and_total_sets_in_the_window():
    # Arrange — two performances today and yesterday, five sets in all
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_a",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=5),
            LoggedSetDraft(exercise_id=SQUAT, reps=5),
            LoggedSetDraft(exercise_id=PRESS, reps=8),
        ],
    )
    _log(
        sessions,
        logged,
        "user_a",
        TODAY - timedelta(days=1),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=5),
            LoggedSetDraft(exercise_id=PRESS, reps=8),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_a", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )

    # Assert
    assert overview.sessions == 2
    assert overview.active_days == 2
    assert overview.total_sets == 5


def test_overview_carries_the_set_count_muscle_distribution_for_the_window():
    # Arrange — in the window: two Squat sets (Legs) and one Press set (Shoulders +
    # Arms). Three sets total; the Press set splits evenly across its two groups.
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_dist",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=5),
            LoggedSetDraft(exercise_id=SQUAT, reps=5),
            LoggedSetDraft(exercise_id=PRESS, reps=8),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_dist", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )

    # Assert — Legs = 2 whole sets, Shoulders & Arms = half a set each, /3 sets
    assert dict(overview.muscle_distribution) == {
        MuscleGroup.LEGS.value: 2 / 3 * 100,
        MuscleGroup.SHOULDERS.value: 0.5 / 3 * 100,
        MuscleGroup.ARMS.value: 0.5 / 3 * 100,
    }


def test_muscle_distribution_is_empty_when_nothing_is_logged():
    # Arrange — a user with no history at all
    _, _, logged = _build()

    # Act
    overview = analytics_overview(
        "user_empty", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — the honest empty state: no distribution, not an error
    assert overview.muscle_distribution == ()


def test_muscle_distribution_only_covers_sessions_inside_the_window():
    # Arrange — a Legs session inside 7d and a Press session just outside it
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_win",
        TODAY - timedelta(days=1),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5)],
    )
    _log(
        sessions,
        logged,
        "user_win",
        TODAY - timedelta(days=10),
        [LoggedSetDraft(exercise_id=PRESS, reps=8)],
    )

    # Act — the 7d window excludes the 10-day-old Press session
    overview = analytics_overview(
        "user_win", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )

    # Assert — only the in-window Legs work shows
    assert dict(overview.muscle_distribution) == {MuscleGroup.LEGS.value: 100.0}


def test_sessions_outside_the_rolling_window_are_excluded():
    # Arrange — one session inside a 7-day window (6 days ago) and one just outside
    # it (7 days ago). The 7d window spans today and the six days before it.
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_b",
        TODAY - timedelta(days=6),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5)],
    )
    _log(
        sessions,
        logged,
        "user_b",
        TODAY - timedelta(days=7),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5)],
    )

    # Act
    overview = analytics_overview(
        "user_b", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )

    # Assert — only the in-window performance counts
    assert overview.sessions == 1
    assert overview.total_sets == 1


def test_a_wider_range_pulls_in_sessions_a_shorter_one_excludes():
    # Arrange — a performance 20 days ago: outside 7d, inside 30d
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_c",
        TODAY - timedelta(days=20),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5)],
    )

    # Act
    seven = analytics_overview(
        "user_c", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )
    thirty = analytics_overview(
        "user_c", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert
    assert seven.sessions == 0
    assert thirty.sessions == 1
    assert thirty.range == "30d"


def test_a_user_who_logged_nothing_gets_zero_counts_not_an_error():
    # Arrange — a user with no Logged Sessions at all
    _, _, logged = _build()

    # Act
    overview = analytics_overview(
        "user_empty", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — the honest empty state is all zeros
    assert overview.sessions == 0
    assert overview.active_days == 0
    assert overview.total_sets == 0


def test_another_users_sessions_do_not_count_toward_my_totals():
    # Arrange — the owner and another user both trained today
    _, sessions, logged = _build()
    _log(
        sessions, logged, "user_me", TODAY, [LoggedSetDraft(exercise_id=SQUAT, reps=5)]
    )
    _log(
        sessions,
        logged,
        "user_them",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=5),
            LoggedSetDraft(exercise_id=PRESS, reps=8),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_me", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )

    # Assert — only my own performance is counted
    assert overview.sessions == 1
    assert overview.total_sets == 1


def test_two_sessions_on_the_same_day_are_two_sessions_but_one_active_day():
    # Arrange — a double-session day
    _, sessions, logged = _build()
    _log(sessions, logged, "user_d", TODAY, [LoggedSetDraft(exercise_id=SQUAT, reps=5)])
    _log(sessions, logged, "user_d", TODAY, [LoggedSetDraft(exercise_id=PRESS, reps=8)])

    # Act
    overview = analytics_overview(
        "user_d", AnalyticsRange.SEVEN_DAY, logged=logged, today=TODAY
    )

    # Assert — sessions counts both, active days collapses to one
    assert overview.sessions == 2
    assert overview.active_days == 1
    assert overview.total_sets == 2
