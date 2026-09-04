"""ADR-0065 behavioural table — warm-ups leave working-set analytics, nothing else.

Issue #453 gives Set Type its *one* behavioural consequence: a ``warm_up`` Logged Set
stops counting toward **Volume** (kg tonnage) and **strength records** (Estimated 1RM /
Personal Record / Top Set), where counting it would mislead. Every other projection is
**type-neutral** — XP, Streak, Completion Outcome, and Logged Count reward work performed
and never read the label — and a legacy set with no Set Type reads as ``working`` and
counts everywhere.

These tests log the *same* workout twice — once all-``working``, once with the light sets
tagged ``warm_up`` — and pin that the two histories agree on every type-neutral figure
while diverging exactly on Volume and records. The per-engine unit tests live in
``test_volume`` / ``test_personal_records_domain`` / ``test_top_sets``; this module is the
cross-cutting regression that the exclusion did not leak into the neutral projections."""

from __future__ import annotations

from datetime import date

from tests.quantities import reps_quantity

from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.logbook.analytics import AnalyticsRange, analytics_overview
from app.logbook.exercise_records import exercise_records
from app.logbook.gamification import project_gamification
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
TODAY = date(2026, 7, 5)


def _build():
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, sessions, logged


def _abs(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _log(sessions, logged, user, *, warm_up: bool) -> int:
    """Log one squat workout: a light opener + a working single at 100 kg.

    With ``warm_up`` the opener is tagged ``warm_up``; otherwise both are ``working``.
    Everything else — the prescribing Session, the date, the declared Completion Outcome,
    the set count — is identical, so any figure that moves between the two histories moved
    *because of* the Set Type and nothing else.
    """

    session = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session.id,
            performed_on=TODAY,
            completion_outcome="completed",
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=SQUAT,
                    quantity=reps_quantity(1),
                    load=_abs(60.0),
                    set_type="warm_up" if warm_up else "working",
                ),
                LoggedSetDraft(
                    exercise_id=SQUAT,
                    quantity=reps_quantity(1),
                    load=_abs(100.0),
                    set_type="working",
                ),
            ],
        ),
    )
    return session.id


def test_xp_is_unaffected_by_set_type():
    # Arrange — the same two-set workout, warm-up-tagged vs all-working
    _, s1, l1 = _build()
    _log(s1, l1, "plain", warm_up=False)
    _, s2, l2 = _build()
    _log(s2, l2, "warm", warm_up=True)

    # Act
    plain = project_gamification(l1.list_for_user("plain"), today=TODAY)
    warm = project_gamification(l2.list_for_user("warm"), today=TODAY)

    # Assert — XP rewards every attempted set; a warm-up is still work (ADR-0018/0065)
    assert warm.xp == plain.xp
    assert warm.level == plain.level


def test_streak_is_unaffected_by_set_type():
    # Arrange — identical dates, differing only in Set Type
    _, s1, l1 = _build()
    _log(s1, l1, "plain", warm_up=False)
    _, s2, l2 = _build()
    _log(s2, l2, "warm", warm_up=True)

    # Act / Assert — the weekly Streak counts weeks with a Logged Session, blind to labels
    assert (
        project_gamification(l2.list_for_user("warm"), today=TODAY).streak
        == project_gamification(l1.list_for_user("plain"), today=TODAY).streak
        == 1
    )


def test_completion_outcome_is_unaffected_by_set_type():
    # Arrange — both workouts declared Completed; one carries a warm-up
    _, s1, l1 = _build()
    _log(s1, l1, "plain", warm_up=False)
    _, s2, l2 = _build()
    _log(s2, l2, "warm", warm_up=True)

    # Act
    plain = l1.list_for_user("plain")[0]
    warm = l2.list_for_user("warm")[0]

    # Assert — the client-declared outcome (ADR-0013) round-trips regardless of Set Type
    assert warm.completion_outcome == plain.completion_outcome == "completed"


def test_logged_count_is_unaffected_by_set_type():
    # Arrange — one performance each, differing only in Set Type
    _, s1, l1 = _build()
    sid_plain = _log(s1, l1, "plain", warm_up=False)
    _, s2, l2 = _build()
    sid_warm = _log(s2, l2, "warm", warm_up=True)

    # Act / Assert — Logged Count counts performances, never sets or their labels (ADR-0063)
    assert (
        l2.count_for_session("warm", sid_warm)
        == l1.count_for_session("plain", sid_plain)
        == 1
    )


def test_volume_and_records_do_diverge_on_the_warm_up():
    # Arrange — the two histories that agree on every neutral figure above
    _, s1, l1 = _build()
    _log(s1, l1, "plain", warm_up=False)
    _, s2, l2 = _build()
    _log(s2, l2, "warm", warm_up=True)

    # Act
    plain_vol = analytics_overview(
        "plain", AnalyticsRange.THIRTY_DAY, logged=l1, today=TODAY
    ).volume_points[0].volume_kg
    warm_vol = analytics_overview(
        "warm", AnalyticsRange.THIRTY_DAY, logged=l2, today=TODAY
    ).volume_points[0].volume_kg

    plain_pr = exercise_records("plain", SQUAT, logged=l1)
    warm_pr = exercise_records("warm", SQUAT, logged=l2)

    # Assert — the one behavioural consequence: dropping the 60 kg opener as a warm-up
    # removes its 60 kg of tonnage and its top set from the record side, while the
    # all-working history keeps both. This is the divergence the neutral tests bound.
    assert plain_vol - warm_vol == 60.0
    assert len(warm_pr.pr_milestones) == 1  # only the working 100 kg
    assert len(plain_pr.pr_milestones) == 2  # the 60 kg opener also set an earlier PR
