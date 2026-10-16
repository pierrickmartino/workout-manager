"""Adoption: turn an immutable Generated Protocol into a user-owned copy (ADR-0003).

``adopt`` deep-copies a ``GeneratedProtocol`` into a mutable, user-owned ``Protocol``:
each prescribed Exercise is resolved through the shared catalog (``find_or_create``
with ``ai_generated`` provenance and normalized-name dedup) and every Week/Day
Session is persisted with its prescriptions referencing those catalog Exercises.
Only scalar values are copied across, so the user's Protocol shares no mutable state
with the source — mutating one never touches the other. The Generated artifact (a
future cache entry) stays pristine."""

from __future__ import annotations

from app.generation.prescriptions import resolve_prescriptions
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import GeneratedProtocol
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.protocol_repository import (
    ProtocolDraft,
    ProtocolRepository,
    ProtocolSessionDraft,
    ProtocolView,
)


def adopt(
    generated: GeneratedProtocol,
    clerk_user_id: str,
    params: ProtocolGenerationRequest,
    *,
    exercises: ExerciseRepository,
    protocols: ProtocolRepository,
) -> ProtocolView:
    """Deep-copy ``generated`` into a Protocol owned by ``clerk_user_id``.

    Resolves each prescribed Exercise through the shared catalog and persists a
    fully-enumerated, user-owned copy. The source ``generated`` artifact is read
    but never mutated; the returned Protocol shares no mutable state with it.
    """

    session_drafts = [
        ProtocolSessionDraft(
            week=session.week,
            day=session.day,
            title=session.title,
            prescriptions=resolve_prescriptions(
                session.prescriptions, exercises=exercises
            ),
        )
        for session in generated.sessions
    ]

    draft = ProtocolDraft(
        training_type=params.training_type,
        objective=params.objective,
        sessions_per_week=params.sessions_per_week,
        weeks=params.weeks,
        duration_minutes=params.duration_minutes,
        sessions=session_drafts,
    )
    return protocols.create(clerk_user_id, draft)


__all__ = ["adopt"]
