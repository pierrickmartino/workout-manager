"""The Delete service — the guarded, cascade removal of a standalone Session (ADR-0063).

``delete_session`` refuses a Session that has any Logged Session (a performed plan is settled
record and never deleted), refuses a Protocol member (standalone-only), and otherwise removes
the Session with its plan-side dependents — Prescriptions, the Favorite marker, Generation
Feedback, and Share Links — leaving every other user's Redeemed copy untouched. It orchestrates
repositories, so it is tested against the in-memory fakes with no database.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.exercise import Provenance
from app.domain.feedback import Verdict
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.favorite_repository import InMemoryFavoriteRepository
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from app.repositories.share_link_repository import InMemoryShareLinkRepository
from app.sessions.service import (
    SessionHasLoggedSessions,
    SessionNotFound,
    SessionNotStandalone,
    delete_session,
)


def _fixture():
    exercises = InMemoryExerciseRepository()
    exercise = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    favorites = InMemoryFavoriteRepository()
    sessions = InMemorySessionRepository(exercises, favorites=favorites)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    shares = InMemoryShareLinkRepository()
    feedback = InMemoryGenerationFeedbackRepository()
    return exercises, exercise, favorites, sessions, logged, shares, feedback


def _make_session(sessions, user, exercise_id):
    return sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=exercise_id, sets=5, reps="5"),
            ],
        ),
    )


def _delete(sessions, logged, shares, feedback, session_id, user):
    delete_session(
        session_id,
        user,
        sessions=sessions,
        logged=logged,
        shares=shares,
        feedback=feedback,
    )


def test_deletes_an_unperformed_standalone_session():
    _, exercise, _, sessions, logged, shares, feedback = _fixture()
    view = _make_session(sessions, "user_a", exercise.id)

    _delete(sessions, logged, shares, feedback, view.id, "user_a")

    assert sessions.get(view.id, "user_a") is None


def test_cascades_favorite_feedback_and_share_links():
    _, exercise, favorites, sessions, logged, shares, feedback = _fixture()
    view = _make_session(sessions, "user_a", exercise.id)
    sessions.set_favorite(view.id, "user_a", True)
    shares.create(view.id, "user_a")
    feedback.record(
        "user_a", session_id=view.id, verdict=Verdict.NEGATIVE, reason="too hard"
    )

    _delete(sessions, logged, shares, feedback, view.id, "user_a")

    assert favorites.is_favorite("user_a", view.id) is False
    assert feedback.latest(view.id, "user_a") is None
    # Every active link for the Session is gone (a fresh token would be needed to re-share).
    assert shares._active_for_session(view.id, "user_a") is None


def test_refuses_a_session_with_a_logged_performance():
    _, exercise, _, sessions, logged, shares, feedback = _fixture()
    view = _make_session(sessions, "user_a", exercise.id)
    logged.create(
        "user_a",
        LoggedSessionDraft(
            session_id=view.id,
            performed_on=date(2026, 1, 1),
            training_type="strength",
            completion_outcome="incomplete",
            logged_sets=[LoggedSetDraft(exercise_id=exercise.id)],
        ),
    )

    with pytest.raises(SessionHasLoggedSessions):
        _delete(sessions, logged, shares, feedback, view.id, "user_a")

    # Nothing was removed — the plan and its record are both intact.
    assert sessions.get(view.id, "user_a") is not None


def test_refuses_a_protocol_member_session():
    _, exercise, _, sessions, logged, shares, feedback = _fixture()
    view = _make_session(sessions, "user_a", exercise.id)
    sessions._sessions[view.id].protocol_id = 99

    with pytest.raises(SessionNotStandalone):
        _delete(sessions, logged, shares, feedback, view.id, "user_a")

    assert sessions.get(view.id, "user_a") is not None


def test_refuses_a_non_owned_session():
    _, exercise, _, sessions, logged, shares, feedback = _fixture()
    view = _make_session(sessions, "user_a", exercise.id)

    with pytest.raises(SessionNotFound):
        _delete(sessions, logged, shares, feedback, view.id, "user_intruder")

    assert sessions.get(view.id, "user_a") is not None


def test_refuses_an_unknown_session():
    _, _, _, sessions, logged, shares, feedback = _fixture()

    with pytest.raises(SessionNotFound):
        _delete(sessions, logged, shares, feedback, 424242, "user_a")
