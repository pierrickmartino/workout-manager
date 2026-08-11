"""Behavior of the GenerationFeedback repository through its public interface,
over both the in-memory fake and the real SQLModel implementation.

Generation Feedback is the user's verdict on a Session and the trigger for
Regeneration: a Session may accumulate several over time, and the *latest* one is
what decides whether regeneration is allowed and supplies its steering reason.
Reads are owner-scoped — feedback is never served to another user."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import WorkoutSession
from app.domain.feedback import Verdict
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
    SqlGenerationFeedbackRepository,
)

# The Session ids these tests record feedback against. Under FK enforcement the parent
# ``workout_session`` rows must exist, so the SQL fixture seeds them (the in-memory fake
# has no such constraint). Feedback references a Session (``generation_feedback.session_id
# -> workout_session.id``); this suite exercises the feedback repo, not Session creation.
_SEEDED_SESSION_IDS = range(1, 12)


@pytest.fixture(params=["in_memory", "sql"])
def feedback_repo(request):
    if request.param == "in_memory":
        yield InMemoryGenerationFeedbackRepository()
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        for session_id in _SEEDED_SESSION_IDS:
            session.add(
                WorkoutSession(
                    id=session_id,
                    clerk_user_id="seed",
                    training_type="strength",
                    duration_minutes=45,
                )
            )
        session.commit()
        yield SqlGenerationFeedbackRepository(session)


def test_records_positive_feedback_without_a_reason(feedback_repo):
    # Act
    view = feedback_repo.record(
        "user_pos", session_id=1, verdict=Verdict.POSITIVE, reason=None
    )

    # Assert
    assert view.id is not None
    assert view.clerk_user_id == "user_pos"
    assert view.session_id == 1
    assert view.verdict == "positive"
    assert view.reason is None


def test_records_negative_feedback_with_a_reason(feedback_repo):
    # Act
    view = feedback_repo.record(
        "user_neg",
        session_id=7,
        verdict=Verdict.NEGATIVE,
        reason="too much knee load",
    )

    # Assert
    assert view.verdict == "negative"
    assert view.reason == "too much knee load"


def test_latest_returns_none_when_no_feedback_exists(feedback_repo):
    # Assert
    assert feedback_repo.latest(999, "user_any") is None


def test_latest_returns_the_most_recent_feedback_for_the_session(feedback_repo):
    # Arrange — the verdict flips over time; the newest one wins
    feedback_repo.record(
        "user_flip", session_id=3, verdict=Verdict.NEGATIVE, reason="boring"
    )
    feedback_repo.record(
        "user_flip", session_id=3, verdict=Verdict.POSITIVE, reason=None
    )

    # Act
    latest = feedback_repo.latest(3, "user_flip")

    # Assert
    assert latest is not None
    assert latest.verdict == "positive"


def test_latest_is_scoped_per_session(feedback_repo):
    # Arrange — feedback on a different session must not bleed across
    feedback_repo.record(
        "user_scope", session_id=10, verdict=Verdict.NEGATIVE, reason="x"
    )

    # Assert — a different session has none
    assert feedback_repo.latest(11, "user_scope") is None


def test_latest_does_not_leak_another_users_feedback(feedback_repo):
    # Arrange — feedback is owner-scoped
    feedback_repo.record(
        "user_owner", session_id=5, verdict=Verdict.NEGATIVE, reason="secret"
    )

    # Assert
    assert feedback_repo.latest(5, "user_intruder") is None
