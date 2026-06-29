"""The Session Regeneration flow: AI replaces the non-kept prescriptions.

``regenerate_session`` orchestrates Slice 10's regeneration. Regeneration is
gated on the Session's latest Generation Feedback being negative (the trigger),
is limited to once per Session, and operates only on the user's own copy — it
bypasses the generation cache entirely (there is none on this path; the cache and
async land in Slices 6–7). It builds the AI request from the kept prescriptions
and the stored feedback reason so progression stays coherent, resolves the
replacement Exercises through the shared catalog, and persists the result. A
``GenerationError`` from the regenerator propagates before anything is written, so
the Session is never left half-regenerated."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.exercise import Provenance
from app.domain.feedback import Verdict
from app.generation.regenerator import (
    KeptPrescription,
    RegenerationRequest,
    SessionRegenerator,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
)
from app.repositories.session_repository import (
    PrescriptionDraft,
    SessionRepository,
    SessionView,
)


class SessionNotFound(Exception):
    """The Session does not exist or is owned by another user."""


class RegenerationNotAllowed(Exception):
    """The Session has already been regenerated (once-per-Session limit)."""


class RegenerationRequiresNegativeFeedback(Exception):
    """Regeneration was requested without a negative Generation Feedback trigger."""


def _kept_context(
    view: SessionView, keep_positions: Sequence[int]
) -> list[KeptPrescription]:
    keep = set(keep_positions)
    return [
        KeptPrescription(
            exercise_name=p.exercise_name,
            sets=p.sets,
            reps=p.reps,
            recommended_load=p.recommended_load,
        )
        for p in view.prescriptions
        if p.position in keep
    ]


def regenerate_session(
    session_id: int,
    clerk_user_id: str,
    keep_positions: Sequence[int],
    *,
    regenerator: SessionRegenerator,
    feedback: GenerationFeedbackRepository,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
) -> SessionView:
    """Regenerate one Session's non-kept prescriptions for its owner.

    Raises ``SessionNotFound`` if the user does not own the Session,
    ``RegenerationNotAllowed`` if it was already regenerated,
    ``RegenerationRequiresNegativeFeedback`` if its latest verdict is not negative,
    and ``GenerationError`` (from the regenerator) on malformed output — in every
    failure case nothing is persisted.
    """

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    if view.has_been_regenerated:
        raise RegenerationNotAllowed(session_id)

    latest = feedback.latest(session_id, clerk_user_id)
    if latest is None or latest.verdict != Verdict.NEGATIVE.value:
        raise RegenerationRequiresNegativeFeedback(session_id)

    request = RegenerationRequest(
        training_type=view.training_type,
        duration_minutes=view.duration_minutes,
        kept=_kept_context(view, keep_positions),
        reason=latest.reason,
    )
    generated = regenerator.regenerate(request)

    replacements: list[PrescriptionDraft] = []
    for item in generated.prescriptions:
        exercise = exercises.find_or_create(
            item.exercise_name,
            provenance=Provenance.AI_GENERATED,
            description=item.exercise_description,
            targeted_muscles=item.targeted_muscles,
            required_equipment=item.required_equipment,
        )
        replacements.append(
            PrescriptionDraft(
                exercise_id=exercise.id,
                sets=item.sets,
                reps=item.reps,
                rest_seconds=item.rest_seconds,
                tempo=item.tempo,
                recommended_load=item.recommended_load,
            )
        )

    result = sessions.regenerate(
        session_id,
        clerk_user_id,
        keep_positions=keep_positions,
        replacements=replacements,
    )
    if result is None:  # ownership was checked above; defensive only
        raise SessionNotFound(session_id)
    return result


__all__ = [
    "SessionNotFound",
    "RegenerationNotAllowed",
    "RegenerationRequiresNegativeFeedback",
    "regenerate_session",
]
