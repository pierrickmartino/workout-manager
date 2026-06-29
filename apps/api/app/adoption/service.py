"""Adoption: turn an immutable Generated Program into a user-owned copy (ADR-0003).

``adopt`` deep-copies a ``GeneratedProgram`` into a mutable, user-owned ``Program``:
each prescribed Exercise is resolved through the shared catalog (``find_or_create``
with ``ai_generated`` provenance and normalized-name dedup) and every Week/Day
Session is persisted with its prescriptions referencing those catalog Exercises.
Only scalar values are copied across, so the user's Program shares no mutable state
with the source — mutating one never touches the other. The Generated artifact (a
future cache entry) stays pristine."""

from __future__ import annotations

from app.domain.exercise import Provenance
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.schema import GeneratedProgram
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.program_repository import (
    ProgramDraft,
    ProgramRepository,
    ProgramSessionDraft,
    ProgramView,
)
from app.repositories.session_repository import PrescriptionDraft


def adopt(
    generated: GeneratedProgram,
    clerk_user_id: str,
    params: ProgramGenerationRequest,
    *,
    exercises: ExerciseRepository,
    programs: ProgramRepository,
) -> ProgramView:
    """Deep-copy ``generated`` into a Program owned by ``clerk_user_id``.

    Resolves each prescribed Exercise through the shared catalog and persists a
    fully-enumerated, user-owned copy. The source ``generated`` artifact is read
    but never mutated; the returned Program shares no mutable state with it.
    """

    session_drafts: list[ProgramSessionDraft] = []
    for session in generated.sessions:
        prescriptions: list[PrescriptionDraft] = []
        for item in session.prescriptions:
            exercise = exercises.find_or_create(
                item.exercise_name,
                provenance=Provenance.AI_GENERATED,
                description=item.exercise_description,
                targeted_muscles=list(item.targeted_muscles),
                required_equipment=list(item.required_equipment),
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
        session_drafts.append(
            ProgramSessionDraft(
                week=session.week,
                day=session.day,
                title=session.title,
                prescriptions=prescriptions,
            )
        )

    draft = ProgramDraft(
        training_type=params.training_type,
        objective=params.objective,
        sessions_per_week=params.sessions_per_week,
        weeks=params.weeks,
        duration_minutes=params.duration_minutes,
        sessions=session_drafts,
    )
    return programs.create(clerk_user_id, draft)


__all__ = ["adopt"]
