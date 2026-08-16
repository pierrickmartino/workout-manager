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

from tests.quantities import reps_quantity

from datetime import date, timedelta

from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.domain.quantity import Quantity, QuantityKind
from app.domain.week import week_start
from app.domain.muscle_groups import GROUP_ORDER, MuscleGroup
from app.logbook.analytics import AnalyticsRange, analytics_overview
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
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


def test_counts_sessions_active_days_and_total_sets_in_the_window():
    # Arrange — two performances today and yesterday, five sets in all
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_a",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(8)),
        ],
    )
    _log(
        sessions,
        logged,
        "user_a",
        TODAY - timedelta(days=1),
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(8)),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_a", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
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
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(8)),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_dist", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
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
    # Arrange — a Legs session inside 30d and a Press session just outside it
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_win",
        TODAY - timedelta(days=1),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
    )
    _log(
        sessions,
        logged,
        "user_win",
        TODAY - timedelta(days=40),
        [LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(8))],
    )

    # Act — the 30d window excludes the 40-day-old Press session
    overview = analytics_overview(
        "user_win", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — only the in-window Legs work shows
    assert dict(overview.muscle_distribution) == {MuscleGroup.LEGS.value: 100.0}


def test_sessions_outside_the_rolling_window_are_excluded():
    # Arrange — one session inside a 30-day window (29 days ago) and one just outside
    # it (30 days ago). The 30d window spans today and the 29 days before it.
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_b",
        TODAY - timedelta(days=29),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
    )
    _log(
        sessions,
        logged,
        "user_b",
        TODAY - timedelta(days=30),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
    )

    # Act
    overview = analytics_overview(
        "user_b", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — only the in-window performance counts
    assert overview.sessions == 1
    assert overview.total_sets == 1


def test_a_wider_range_pulls_in_sessions_a_shorter_one_excludes():
    # Arrange — a performance 40 days ago: outside 30d, inside 90d
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_c",
        TODAY - timedelta(days=40),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
    )

    # Act
    thirty = analytics_overview(
        "user_c", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )
    ninety = analytics_overview(
        "user_c", AnalyticsRange.NINETY_DAY, logged=logged, today=TODAY
    )

    # Assert
    assert thirty.sessions == 0
    assert ninety.sessions == 1
    assert ninety.range == "90d"


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
        sessions, logged, "user_me", TODAY, [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))]
    )
    _log(
        sessions,
        logged,
        "user_them",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5)),
            LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(8)),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_me", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — only my own performance is counted
    assert overview.sessions == 1
    assert overview.total_sets == 1


def test_recent_records_surface_all_time_prs_newest_first_decoupled_from_the_window():
    # Arrange — a 100 kg PR 200 days ago and a heavier 110 kg PR 100 days ago, both
    # far outside the 30-day window the toggle is on
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_pr",
        TODAY - timedelta(days=200),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(1), load=_abs(100.0))],
    )
    _log(
        sessions,
        logged,
        "user_pr",
        TODAY - timedelta(days=100),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(1), load=_abs(110.0))],
    )

    # Act — the short window would exclude both, but the feed is decoupled from it
    overview = analytics_overview(
        "user_pr", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — both all-time PRs show, newest first, with gain over the prior PR
    assert [r.estimated_1rm for r in overview.recent_records] == [110.0, 100.0]
    assert overview.recent_records[0].gain == 10.0
    assert overview.recent_records[0].exercise_name == "Back Squat"


def test_recent_records_surface_a_bodyweight_pr_so_the_nav_gate_admits_calisthenics():
    # Arrange — a pure-calisthenics user: one bodyweight Pull-up in the 1–12 rep window
    # with the performer's mass snapshotted onto the set (ADR-0026). No absolute-load work
    # at all. This feed is the signal the Analytics screen gates the Strength Analytics nav
    # entry on, so a non-empty feed here is what admits the calisthenics user (#201).
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_calisthenics",
        TODAY,
        [
            LoggedSetDraft(
                exercise_id=PRESS,
                quantity=reps_quantity(8),
                load=ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict(),
                body_weight_kg=75.0,
            )
        ],
    )

    # Act
    overview = analytics_overview(
        "user_calisthenics", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — the bodyweight set sets a PR and surfaces on the feed as the set that
    # achieved it (reps, not a kg headline), opening the nav gate for a calisthenics user.
    assert len(overview.recent_records) == 1
    assert overview.recent_records[0].is_bodyweight is True
    assert overview.recent_records[0].reps == 8


def test_recent_records_keep_only_the_eight_most_recent():
    # Arrange — ten PRs on ten distinct days, each newer day heavier than the last so
    # every set clears the previous best (day 10 = oldest = 100 kg … day 1 = 109 kg)
    _, sessions, logged = _build()
    for day in range(1, 11):
        kg = 100.0 + (10 - day)
        _log(
            sessions,
            logged,
            "user_many",
            TODAY - timedelta(days=day),
            [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(1), load=_abs(kg))],
        )

    # Act
    overview = analytics_overview(
        "user_many", AnalyticsRange.NINETY_DAY, logged=logged, today=TODAY
    )

    # Assert — capped at the eight newest; the heaviest (newest) leads
    assert len(overview.recent_records) == 8
    assert overview.recent_records[0].estimated_1rm == 109.0


def test_new_prs_count_only_records_dated_inside_the_window():
    # Arrange — one PR 40 days ago (outside 30d) and one 2 days ago (inside)
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_win_pr",
        TODAY - timedelta(days=40),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(1), load=_abs(100.0))],
    )
    _log(
        sessions,
        logged,
        "user_win_pr",
        TODAY - timedelta(days=2),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(1), load=_abs(110.0))],
    )

    # Act
    overview = analytics_overview(
        "user_win_pr", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — only the in-window PR is counted, though the feed still shows both
    assert overview.new_prs == 1
    assert len(overview.recent_records) == 2


def test_a_user_with_no_records_has_an_empty_feed_and_zero_new_prs():
    # Arrange — a session logged with only a qualitative load: no PR possible
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_no_pr",
        TODAY,
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
    )

    # Act
    overview = analytics_overview(
        "user_no_pr", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — honest empty state, not an error
    assert overview.recent_records == ()
    assert overview.new_prs == 0


def test_two_sessions_on_the_same_day_are_two_sessions_but_one_active_day():
    # Arrange — a double-session day
    _, sessions, logged = _build()
    _log(sessions, logged, "user_d", TODAY, [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))])
    _log(sessions, logged, "user_d", TODAY, [LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(8))])

    # Act
    overview = analytics_overview(
        "user_d", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — sessions counts both, active days collapses to one
    assert overview.sessions == 2
    assert overview.active_days == 1
    assert overview.total_sets == 2


def _abs_load(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load (volume tests)."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _bodyweight_load() -> dict:
    """The stored typed-Load dict for a plain bodyweight load (volume tests)."""

    return ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()


def test_overview_carries_the_daily_volume_series_for_the_window():
    # Arrange — 100kg×5 today and 80kg×5 yesterday, both absolute and convertible
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_vol",
        TODAY,
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=_abs_load(100.0))],
    )
    _log(
        sessions,
        logged,
        "user_vol",
        TODAY - timedelta(days=1),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=_abs_load(80.0))],
    )

    # Act
    overview = analytics_overview(
        "user_vol", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — daily points ascending, full coverage, no prior-window baseline
    assert [(p.performed_on, p.volume_kg) for p in overview.volume_points] == [
        (TODAY - timedelta(days=1), 400.0),
        (TODAY, 500.0),
    ]
    assert overview.volume_coverage == 100.0
    assert overview.volume_delta is None


def test_overview_volume_coverage_discloses_unconvertible_reps():
    # Arrange — 5 absolute reps and 5 qualitative reps in the window
    _, sessions, logged = _build()
    qualitative = ParsedLoad(kind=LoadKind.QUALITATIVE, text="hard").to_dict()
    _log(
        sessions,
        logged,
        "user_cov",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=_abs_load(100.0)),
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=qualitative),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_cov", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — only half the logged reps converted
    assert overview.volume_coverage == 50.0


def test_overview_volume_is_empty_when_nothing_is_logged():
    # Arrange — a user with no history
    _, _, logged = _build()

    # Act
    overview = analytics_overview(
        "user_empty_vol", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — the honest empty state, not an error
    assert overview.volume_points == ()
    assert overview.volume_coverage == 0.0
    assert overview.volume_delta is None


def _percent_load(pct: float) -> dict:
    """The stored typed-Load dict for a percent-of-1RM load (volume tests)."""

    return ParsedLoad(
        kind=LoadKind.PERCENT_1RM, text=f"{pct:g}% 1RM", percent=pct
    ).to_dict()


def test_overview_folds_bodyweight_and_percent_volume_when_the_inputs_exist():
    # Arrange — a recorded 70 kg body weight, a Squat Estimated 1RM (100 kg × 1), a
    # bodyweight Press set (10 × 70 = 700) and an 80% Squat set (3 × 80 = 240), today.
    _, sessions, logged = _build()
    profiles = InMemoryProfileRepository()
    profiles.update("user_fold", ProfileUpdate(weight_kg=70.0))
    _log(
        sessions,
        logged,
        "user_fold",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(1), load=_abs_load(100.0)),
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(3), load=_percent_load(80.0)),
            LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(10), load=_bodyweight_load()),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_fold",
        AnalyticsRange.THIRTY_DAY,
        logged=logged,
        today=TODAY,
        profiles=profiles,
    )

    # Assert — all three convert (100 + 240 + 700) and every rep is covered
    assert [(p.performed_on, p.volume_kg) for p in overview.volume_points] == [
        (TODAY, 1040.0)
    ]
    assert overview.volume_coverage == 100.0


def test_overview_excludes_bodyweight_when_body_weight_is_unrecorded():
    # Arrange — the same bodyweight Press set, but no profile weight to resolve it
    _, sessions, logged = _build()
    profiles = InMemoryProfileRepository()  # weight_kg stays None
    _log(
        sessions,
        logged,
        "user_nobw",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=_abs_load(100.0)),
            LoggedSetDraft(exercise_id=PRESS, quantity=reps_quantity(5), load=_bodyweight_load()),
        ],
    )

    # Act
    overview = analytics_overview(
        "user_nobw",
        AnalyticsRange.THIRTY_DAY,
        logged=logged,
        today=TODAY,
        profiles=profiles,
    )

    # Assert — only the absolute set converts; the bodyweight reps show in coverage
    assert [(p.performed_on, p.volume_kg) for p in overview.volume_points] == [
        (TODAY, 500.0)
    ]
    assert overview.volume_coverage == 50.0


def _covered_groups(overview) -> set[MuscleGroup]:
    """The set of real Muscle Groups the overview's coverage reads as trained."""

    return {MuscleGroup(row.group) for row in overview.coverage.groups if row.covered}


def test_overview_coverage_is_a_fixed_eight_week_window_independent_of_the_range():
    # Arrange — Legs trained 40 days ago: outside the 30-day range, but well inside the
    # fixed 8-week (56-day) coverage window. Coverage must not follow the range toggle.
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_cov",
        TODAY - timedelta(days=40),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5))],
    )

    # Act — the same history read under all three ranges
    overviews = [
        analytics_overview("user_cov", window, logged=logged, today=TODAY)
        for window in AnalyticsRange
    ]

    # Assert — every range reports the identical coverage, and Legs reads trained even
    # though the 30d count excludes that session entirely
    coverages = {o.coverage for o in overviews}
    assert len(coverages) == 1
    for overview in overviews:
        assert _covered_groups(overview) == {MuscleGroup.LEGS}


def test_overview_coverage_reports_all_six_real_groups_ungated():
    # Arrange — a user who has logged nothing still gets the full six-row coverage shape,
    # every group not-trained, so the ungated section can always render.
    _, _, logged = _build()

    # Act
    overview = analytics_overview(
        "user_nocov", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — six real groups in canonical order, all not-trained
    assert tuple(MuscleGroup(row.group) for row in overview.coverage.groups) == tuple(
        group for group in GROUP_ORDER if group is not MuscleGroup.UNCLASSIFIED
    )
    assert all(row.covered is False for row in overview.coverage.groups)


def _distance_quantity(km: float) -> dict:
    """The stored ``distance`` Quantity dict for a ``km``-kilometre run."""

    return Quantity(
        kind=QuantityKind.DISTANCE, text=f"{km:g} km", metres=km * 1000.0
    ).to_dict()


def test_overview_carries_the_weekly_distance_series_and_opens_the_gate():
    # Arrange — a 5 km run today and a 3 km run yesterday (same ISO week), plus a
    # strength set that carries no distance
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_run",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, quantity=_distance_quantity(5.0)),
            LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=_abs(100.0)),
        ],
    )
    _log(
        sessions,
        logged,
        "user_run",
        TODAY - timedelta(days=1),
        [LoggedSetDraft(exercise_id=SQUAT, quantity=_distance_quantity(3.0))],
    )

    # Act
    overview = analytics_overview(
        "user_run", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — today and yesterday fall in the same Monday-anchored week, so the two
    # runs sum into one 8 km bar; the gate opens and there is no baseline delta
    assert [(w.week_start, w.kilometres) for w in overview.distance_weeks] == [
        (week_start(TODAY), 8.0)
    ]
    assert overview.distance_delta is None
    assert overview.has_distance is True


def test_overview_gate_stays_closed_for_a_pure_strength_user():
    # Arrange — a user who only logs rep-and-load sets, never a distance
    _, sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_lift",
        TODAY,
        [LoggedSetDraft(exercise_id=SQUAT, quantity=reps_quantity(5), load=_abs(100.0))],
    )

    # Act
    overview = analytics_overview(
        "user_lift", AnalyticsRange.THIRTY_DAY, logged=logged, today=TODAY
    )

    # Assert — no distance work ever, so the chart is gated off and empty
    assert overview.has_distance is False
    assert overview.distance_weeks == ()
