"""The single-Session generation path: AI output → catalog → persisted Session.

``generate_session`` orchestrates the first end-to-end AI flow (issue Slice 3):
call the generator, resolve each prescribed exercise through the shared catalog
(``find_or_create`` with ``ai_generated`` provenance and normalized-name dedup),
then persist the result as a user-owned standalone Session whose prescriptions
each reference a catalog Exercise. Generation is synchronous and uncached here;
caching and async land in Slices 6–7. A ``GenerationError`` from the generator
propagates before anything is persisted."""

from __future__ import annotations

from app.generation.generator import GenerationRequest, SessionGenerator
from app.generation.prescriptions import resolve_prescriptions
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import (
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

    draft = SessionDraft(
        training_type=request.training_type,
        duration_minutes=request.duration_minutes,
        prescriptions=resolve_prescriptions(
            generated.prescriptions, exercises=exercises
        ),
    )
    return sessions.create(clerk_user_id, draft)


__all__ = ["generate_session"]
