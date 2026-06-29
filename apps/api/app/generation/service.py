"""The single-Session generation path: AI output → catalog → persisted Session.

``generate_session`` orchestrates the first end-to-end AI flow (issue Slice 3):
call the generator, resolve each prescribed exercise through the shared catalog
(``find_or_create`` with ``ai_generated`` provenance and normalized-name dedup),
then persist the result as a user-owned standalone Session whose prescriptions
each reference a catalog Exercise. Generation is synchronous and uncached here;
caching and async land in Slices 6–7. A ``GenerationError`` from the generator
propagates before anything is persisted."""

from __future__ import annotations

from app.domain.exercise import Provenance
from app.generation.generator import GenerationRequest, SessionGenerator
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import (
    PrescriptionDraft,
    SessionDraft,
    SessionRepository,
    SessionView,
)


def generate_session(
    request: GenerationRequest,
    clerk_user_id: str,
    *,
    generator: SessionGenerator,
    exercises: ExerciseRepository,
    sessions: SessionRepository,
) -> SessionView:
    """Generate, catalog-resolve, and persist a standalone Session for the user.

    Raises ``GenerationError`` (from the generator) on malformed output, in which
    case nothing is written.
    """

    generated = generator.generate(request)

    prescriptions: list[PrescriptionDraft] = []
    for item in generated.prescriptions:
        exercise = exercises.find_or_create(
            item.exercise_name,
            provenance=Provenance.AI_GENERATED,
            description=item.exercise_description,
            targeted_muscles=item.targeted_muscles,
            required_equipment=item.required_equipment,
        )
        prescriptions.append(
            PrescriptionDraft(
                exercise_id=exercise.id,
                sets=item.sets,
                reps=item.reps,
                rest_seconds=item.rest_seconds,
                tempo=item.tempo,
                recommended_load=item.recommended_load,
            )
        )

    draft = SessionDraft(
        training_type=request.training_type,
        duration_minutes=request.duration_minutes,
        prescriptions=prescriptions,
    )
    return sessions.create(clerk_user_id, draft)


__all__ = ["generate_session"]
