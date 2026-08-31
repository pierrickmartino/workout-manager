"""Read-time Logged Count projection over the record (ADR-0063, CONTEXT: Logged Count).

The My Sessions counter and the Delete guard read the same fact: how many Logged Sessions
(performances) a user has recorded against a given Session — counted across every Completion
Outcome, never a stored counter. ``count_for_session`` answers it for one Session (the guard);
``count_by_session`` answers it for the whole library in one read (the list badge). A plan-less
Logged Session carries no ``session_id`` and contributes to no count.
"""

from __future__ import annotations

from datetime import date

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import InMemorySessionRepository


def _repos():
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, sessions, logged


def _log(logged, user, session_id, *, outcome="completed"):
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=date(2026, 1, 1),
            training_type="strength",
            completion_outcome=outcome,
            logged_sets=[LoggedSetDraft(exercise_id=1)],
        ),
    )


def test_count_for_session_is_zero_when_never_performed():
    _, _, logged = _repos()

    assert logged.count_for_session("user_a", 7) == 0


def test_count_for_session_counts_every_performance():
    _, _, logged = _repos()
    _log(logged, "user_a", 7)
    _log(logged, "user_a", 7)

    assert logged.count_for_session("user_a", 7) == 2


def test_count_for_session_counts_incomplete_performances_too():
    # An Incomplete performance is still logged training (ADR-0063), so it counts.
    _, _, logged = _repos()
    _log(logged, "user_a", 7, outcome="incomplete")

    assert logged.count_for_session("user_a", 7) == 1


def test_count_for_session_is_owner_scoped():
    _, _, logged = _repos()
    _log(logged, "user_a", 7)

    assert logged.count_for_session("user_b", 7) == 0


def test_count_for_session_ignores_plan_less_records():
    # A plan-less Logged Session has no session_id and belongs to no Session's count.
    _, _, logged = _repos()
    _log(logged, "user_a", None)

    assert logged.count_for_session("user_a", 7) == 0


def test_count_by_session_buckets_counts_by_session_id():
    _, _, logged = _repos()
    _log(logged, "user_a", 7)
    _log(logged, "user_a", 7)
    _log(logged, "user_a", 9)
    _log(logged, "user_a", None)  # plan-less: excluded
    _log(logged, "user_b", 7)  # another user: excluded

    assert logged.count_by_session("user_a") == {7: 2, 9: 1}
