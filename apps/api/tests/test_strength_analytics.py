"""The Strength Analytics read model (F-strength Slice 1): a strength lens over the
honest *record* side. ``strength_analytics_overview`` reads the user's Logged Sessions
once and projects the all-time, all-Exercise **Personal Record timeline** — the same
PRs the Analytics feed detects, reversed to newest-first and paginated — alongside a
``has_qualifying_strength`` gate flag that is true iff the user holds at least one
Personal Record. It reuses ``logbook/records.set_records`` +
``domain/personal_records.detect_personal_records`` verbatim; no new strength math, no
stored ledger. Read-only over the record side and scoped to the owning user. Exercised
with the in-memory Logged-Session repository."""

from __future__ import annotations

from datetime import date, timedelta

from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.domain.muscle_groups import MuscleGroup
from app.logbook.strength_analytics import (
    MUSCLE_BALANCE_WEEKS,
    strength_analytics_overview,
)
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


def _abs(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


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


def test_pr_timeline_is_all_time_newest_first_and_gate_is_open():
    # Arrange — a 100 kg PR 200 days ago, a heavier 110 kg PR 100 days ago
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_pr",
        TODAY - timedelta(days=200),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(100.0))],
    )
    _log(
        sessions,
        logged,
        "user_pr",
        TODAY - timedelta(days=100),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(110.0))],
    )

    # Act
    overview = strength_analytics_overview("user_pr", logged=logged)

    # Assert — both all-time PRs, newest first, with gain over the prior PR; gate open
    assert overview.has_qualifying_strength is True
    assert [r.estimated_1rm for r in overview.pr_timeline] == [110.0, 100.0]
    assert overview.pr_timeline[0].gain == 10.0
    assert overview.total_records == 2


def test_a_user_with_no_qualifying_strength_gets_a_closed_gate_not_an_error():
    # Arrange — a session logged with only a bodyweight load: no absolute-Load PR possible
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_no_pr",
        TODAY,
        [
            LoggedSetDraft(
                exercise_id=SQUAT,
                reps=5,
                load=ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict(),
            )
        ],
    )

    # Act
    overview = strength_analytics_overview("user_no_pr", logged=logged)

    # Assert — the honest empty state: closed gate, empty timeline, not an error
    assert overview.has_qualifying_strength is False
    assert overview.pr_timeline == ()
    assert overview.total_records == 0


def test_an_empty_history_yields_a_closed_gate_zero_state():
    # Arrange — a user who has logged nothing at all
    _, _, logged = _build()

    # Act
    overview = strength_analytics_overview("user_empty", logged=logged)

    # Assert
    assert overview.has_qualifying_strength is False
    assert overview.pr_timeline == ()
    assert overview.total_records == 0


def _log_ascending_prs(sessions, logged, user, count):
    """Log ``count`` Squat singles on distinct days, each heavier than the last.

    Oldest day is lightest, so every set clears the prior best and records — giving a
    newest-first timeline whose leading (heaviest) entry is the most recent day.
    """

    for day in range(1, count + 1):
        kg = 100.0 + (count - day)  # day 1 = newest = heaviest
        _log(
            sessions,
            logged,
            user,
            TODAY - timedelta(days=day),
            [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(kg))],
        )


def test_pagination_returns_only_the_requested_page_but_the_full_total():
    # Arrange — five all-time PRs; ask for the first two, newest first
    _, sessions, logged = _build()
    _log_ascending_prs(sessions, logged, "user_page", 5)

    # Act
    overview = strength_analytics_overview(
        "user_page", logged=logged, limit=2, offset=0
    )

    # Assert — a two-row page (heaviest/newest first), but the total still reports all five
    assert [r.estimated_1rm for r in overview.pr_timeline] == [104.0, 103.0]
    assert overview.total_records == 5


def test_pagination_offset_walks_into_the_middle_of_the_timeline():
    # Arrange — five all-time PRs
    _, sessions, logged = _build()
    _log_ascending_prs(sessions, logged, "user_off", 5)

    # Act — skip the first two, take the next two
    overview = strength_analytics_overview("user_off", logged=logged, limit=2, offset=2)

    # Assert — the third and fourth newest
    assert [r.estimated_1rm for r in overview.pr_timeline] == [102.0, 101.0]
    assert overview.total_records == 5


def test_an_offset_past_the_end_yields_an_empty_page_with_the_gate_still_open():
    # Arrange — three all-time PRs
    _, sessions, logged = _build()
    _log_ascending_prs(sessions, logged, "user_end", 3)

    # Act — page beyond the last record
    overview = strength_analytics_overview(
        "user_end", logged=logged, limit=2, offset=10
    )

    # Assert — an empty page, but the user still qualifies and the total is honest
    assert overview.pr_timeline == ()
    assert overview.total_records == 3
    assert overview.has_qualifying_strength is True


def test_trajectories_rank_the_users_qualifying_lifts_regardless_of_the_page():
    # Arrange — the squat is trained twice, the press once; page-two request must not
    # thin the trajectories, which are the whole (unpaginated) small-multiples set
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_traj",
        TODAY - timedelta(days=10),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(100.0)),
            LoggedSetDraft(exercise_id=PRESS, reps=1, load=_abs(60.0)),
        ],
    )
    _log(
        sessions,
        logged,
        "user_traj",
        TODAY - timedelta(days=3),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(110.0))],
    )

    # Act — even asking for an empty second page of the PR timeline
    overview = strength_analytics_overview(
        "user_traj", logged=logged, limit=1, offset=50
    )

    # Assert — the more-frequently-trained squat leads, each with its oldest-first series
    assert [
        (t.exercise_id, [p.estimated_1rm for p in t.series])
        for t in overview.trajectories
    ] == [
        (SQUAT, [100.0, 110.0]),
        (PRESS, [60.0]),
    ]


def test_weekly_muscle_balance_spans_the_window_oldest_first_with_this_weeks_split():
    # Arrange — one Legs session this week (a Sunday); the balance reads all logged
    # sets, not just qualifying-strength ones
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_bal",
        TODAY,
        [LoggedSetDraft(exercise_id=SQUAT, reps=5, load=_abs(80.0))],
    )

    # Act
    overview = strength_analytics_overview("user_bal", logged=logged, today=TODAY)

    # Assert — a full window of weeks, oldest-first, the last being this week's Legs split
    balance = overview.weekly_muscle_balance
    assert len(balance) == MUSCLE_BALANCE_WEEKS
    weeks = [week.week_start for week in balance]
    assert weeks == sorted(weeks)  # oldest-first
    assert balance[-1].week_start == date(2026, 6, 29)  # Monday of TODAY's week
    assert balance[-1].composition == {MuscleGroup.LEGS: 100.0}
    # Untrained earlier weeks are honest empty weeks, never dropped
    assert balance[0].composition == {}


def test_weekly_muscle_balance_of_an_empty_history_is_all_empty_weeks():
    # Arrange — a user who has logged nothing
    _, _, logged = _build()

    # Act
    overview = strength_analytics_overview("user_empty_bal", logged=logged, today=TODAY)

    # Assert — the window is still spanned; every week is an honest empty composition
    assert len(overview.weekly_muscle_balance) == MUSCLE_BALANCE_WEEKS
    assert all(week.composition == {} for week in overview.weekly_muscle_balance)


def test_a_user_with_no_qualifying_strength_has_no_trajectories():
    # Arrange — bodyweight-only history
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_bw",
        TODAY,
        [
            LoggedSetDraft(
                exercise_id=SQUAT,
                reps=5,
                load=ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict(),
            )
        ],
    )

    # Act
    overview = strength_analytics_overview("user_bw", logged=logged)

    # Assert
    assert overview.trajectories == ()
