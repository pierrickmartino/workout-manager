"""The Session Regeneration flow: negative feedback → keep-some → AI replaces the
rest → user's own copy is updated.

Regeneration is gated on the Session's latest Generation Feedback being negative
(the trigger), is limited to once per Session, steers the AI with the kept
prescriptions and the stored reason, and mutates only the user's own copy — never
a shared/cached artifact. A malformed generation leaves the Session untouched.
Exercised with in-memory repositories and a fake regenerator so the flow runs
offline and deterministically."""

from __future__ import annotations

import pytest

from app.domain.exercise import Provenance
from app.domain.feedback import Verdict
from app.generation.generator import GenerationError
from app.generation.regenerator import RegenerationRequest
from app.generation.regeneration_service import (
    RegenerationNotAllowed,
    RegenerationRequiresNegativeFeedback,
    SessionNotFound,
    regenerate_session,
)
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)


class FakeRegenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error
        self.last_request: RegenerationRequest | None = None

    def regenerate(self, request: RegenerationRequest) -> GeneratedSession:
        self.last_request = request
        if self._error is not None:
            raise self._error
        return self._result


def _replacement_generation() -> GeneratedSession:
    return GeneratedSession(
        prescriptions=[
            GeneratedExercisePrescription(
                exercise_name="Goblet Squat",
                exercise_description="Knee-friendly squat.",
                targeted_muscles=["quads"],
                required_equipment=["dumbbell"],
                sets=3,
                reps="10",
                recommended_load="moderate",
            )
        ]
    )


def _build():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    feedback = InMemoryGenerationFeedbackRepository()
    return exercises, sessions, feedback


def _seed_session(exercises, sessions, user="user_a"):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    press = exercises.find_or_create(
        "Overhead Press", provenance=Provenance.AI_GENERATED
    )
    return sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5"),
                PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
            ],
        ),
    )


def test_regenerates_non_kept_prescriptions_around_the_kept_ones():
    # Arrange — negative feedback is the trigger; keep the squat, drop the press
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)
    feedback.record(
        "user_a", session_id=created.id, verdict=Verdict.NEGATIVE, reason="knees hurt"
    )
    regenerator = FakeRegenerator(result=_replacement_generation())

    # Act
    view = regenerate_session(
        created.id,
        "user_a",
        keep_positions=[0],
        regenerator=regenerator,
        feedback=feedback,
        exercises=exercises,
        sessions=sessions,
    )

    # Assert — kept first, replacement appended; Session marked regenerated
    assert [p.exercise_name for p in view.prescriptions] == [
        "Back Squat",
        "Goblet Squat",
    ]
    assert view.has_been_regenerated is True


def test_regeneration_steers_the_ai_with_kept_context_and_stored_reason():
    # Arrange
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)
    feedback.record(
        "user_a",
        session_id=created.id,
        verdict=Verdict.NEGATIVE,
        reason="too much overhead work",
    )
    regenerator = FakeRegenerator(result=_replacement_generation())

    # Act
    regenerate_session(
        created.id,
        "user_a",
        keep_positions=[0],
        regenerator=regenerator,
        feedback=feedback,
        exercises=exercises,
        sessions=sessions,
    )

    # Assert — the kept prescription and the feedback reason reached the AI
    request = regenerator.last_request
    assert request.reason == "too much overhead work"
    assert [k.exercise_name for k in request.kept] == ["Back Squat"]


def test_replacements_are_resolved_through_the_shared_catalog():
    # Arrange
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)
    feedback.record(
        "user_a", session_id=created.id, verdict=Verdict.NEGATIVE, reason="x"
    )

    # Act
    view = regenerate_session(
        created.id,
        "user_a",
        keep_positions=[0],
        regenerator=FakeRegenerator(result=_replacement_generation()),
        feedback=feedback,
        exercises=exercises,
        sessions=sessions,
    )

    # Assert — the AI-invented replacement is a catalog Exercise, ai_generated
    replacement = view.prescriptions[1]
    assert replacement.provenance == "ai_generated"
    assert exercises.get(replacement.exercise_id) is not None


def test_regeneration_is_blocked_after_the_first_time():
    # Arrange — one regeneration already happened
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)
    feedback.record(
        "user_a", session_id=created.id, verdict=Verdict.NEGATIVE, reason="x"
    )
    regenerate_session(
        created.id,
        "user_a",
        keep_positions=[0],
        regenerator=FakeRegenerator(result=_replacement_generation()),
        feedback=feedback,
        exercises=exercises,
        sessions=sessions,
    )

    # Act / Assert — a second attempt is refused
    with pytest.raises(RegenerationNotAllowed):
        regenerate_session(
            created.id,
            "user_a",
            keep_positions=[0],
            regenerator=FakeRegenerator(result=_replacement_generation()),
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )


def test_regeneration_requires_negative_feedback_first():
    # Arrange — no feedback recorded at all
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)

    # Act / Assert
    with pytest.raises(RegenerationRequiresNegativeFeedback):
        regenerate_session(
            created.id,
            "user_a",
            keep_positions=[0],
            regenerator=FakeRegenerator(result=_replacement_generation()),
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )


def test_positive_feedback_does_not_unlock_regeneration():
    # Arrange — the latest verdict is positive, so there is nothing to fix
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)
    feedback.record(
        "user_a", session_id=created.id, verdict=Verdict.POSITIVE, reason=None
    )

    # Act / Assert
    with pytest.raises(RegenerationRequiresNegativeFeedback):
        regenerate_session(
            created.id,
            "user_a",
            keep_positions=[0],
            regenerator=FakeRegenerator(result=_replacement_generation()),
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )


def test_regenerating_an_unknown_or_unowned_session_is_not_found():
    # Arrange — feedback exists, but the caller does not own the Session
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions, user="user_owner")
    feedback.record(
        "user_intruder", session_id=created.id, verdict=Verdict.NEGATIVE, reason="x"
    )

    # Act / Assert
    with pytest.raises(SessionNotFound):
        regenerate_session(
            created.id,
            "user_intruder",
            keep_positions=[0],
            regenerator=FakeRegenerator(result=_replacement_generation()),
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )


def test_a_malformed_regeneration_leaves_the_session_untouched():
    # Arrange — the AI output fails boundary validation
    exercises, sessions, feedback = _build()
    created = _seed_session(exercises, sessions)
    feedback.record(
        "user_a", session_id=created.id, verdict=Verdict.NEGATIVE, reason="x"
    )

    # Act / Assert — the GenerationError surfaces
    with pytest.raises(GenerationError):
        regenerate_session(
            created.id,
            "user_a",
            keep_positions=[0],
            regenerator=FakeRegenerator(error=GenerationError("bad")),
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )

    # And nothing was persisted: prescriptions and guard are unchanged
    after = sessions.get(created.id, "user_a")
    assert [p.exercise_name for p in after.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert after.has_been_regenerated is False
