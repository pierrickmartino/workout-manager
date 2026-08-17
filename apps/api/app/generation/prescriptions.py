"""Catalog resolution: Generated Exercise Prescriptions → owned PrescriptionDrafts.

The one shared step behind every "AI output becomes the user's own rows" path —
standalone Session generation (``generation/service``), Session Regeneration
(``generation/regeneration_service``), and Protocol Adoption (``adoption/service``).
Each generated prescription's Exercise is resolved through the shared catalog
(``find_or_create`` with ``ai_generated`` provenance and normalized-name dedup,
ADR-0002), and the prescription's scalars — including the typed Load (ADR-0010), the
typed Prescribed Quantity (ADR-0050), and any Superset overlay (ADR-0023) — are
carried onto a ``PrescriptionDraft``.

Pure orchestration over the Exercise catalog: it resolves and maps, it never
persists and never mutates its input. Every field the schema carries is carried
through; a caller that must not carry Superset grouping flattens its generated
prescriptions upstream (Regeneration is flat in v1 — CONTEXT.md §Regeneration,
ADR-0023), so this module never special-cases a path.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.exercise import Provenance
from app.generation.schema import GeneratedExercisePrescription
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import PrescriptionDraft


def resolve_prescriptions(
    prescriptions: Sequence[GeneratedExercisePrescription],
    *,
    exercises: ExerciseRepository,
) -> list[PrescriptionDraft]:
    """Resolve each generated prescription's Exercise and map it to a draft.

    Returns one ``PrescriptionDraft`` per input, in order. Each referenced Exercise
    is resolved through the shared catalog — created ``ai_generated`` on a miss,
    reused on a normalized-name hit (ADR-0002) — and the typed Load, the typed
    Prescribed Quantity, and the Superset overlay are carried across unchanged.
    """

    drafts: list[PrescriptionDraft] = []
    for item in prescriptions:
        exercise = exercises.find_or_create(
            item.exercise_name,
            provenance=Provenance.AI_GENERATED,
            description=item.exercise_description,
            targeted_muscles=list(item.targeted_muscles),
            required_equipment=list(item.required_equipment),
        )
        drafts.append(
            PrescriptionDraft(
                exercise_id=exercise.id,
                sets=item.sets,
                reps=item.reps,
                rest_seconds=item.rest_seconds,
                tempo=item.tempo,
                recommended_load=item.typed_load,
                prescribed_quantity=item.typed_quantity,
                superset_group=item.superset_group,
                round_rest_seconds=item.round_rest_seconds,
            )
        )
    return drafts


__all__ = ["resolve_prescriptions"]
