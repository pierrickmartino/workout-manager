"""The exercise-admin audit trail: the one seam the admin routes record through.

Composes the pure record-iff-changed decision (``app.domain.exercise_audit``) with the
append-only ``ExerciseAuditRepository``, so a handler names an admin act in a single call and
this module owns *whether* a row is written and *what* it holds. Before this, each handler
hand-rolled the before/after compare, picked the ``AuditAction``, and shaped the ``detail`` —
the rule had no home and was copied across three handlers (``set_provenance``, ``_flip_retire``,
``delete_exercise``).

``record_provenance_change`` and ``record_retire_transition`` return the stored ``AuditRecord``
or ``None`` when the act was a no-op (a re-affirmed tier, or a Retire flip to the current
state); ``record_delete`` always records, since a hard delete is terminal. ``list_for`` reads a
trail back for the admin read route, so all four exercise-admin audit routes share this one
seam. It only reads and appends — the trail is append-only (ADR-0075)."""

from __future__ import annotations

from app.domain.exercise_audit import (
    AuditIntent,
    audit_hard_delete,
    audit_provenance_change,
    audit_retire_transition,
)
from app.repositories.exercise_audit_repository import (
    AuditRecord,
    ExerciseAuditRepository,
)


class AuditTrail:
    """Records exercise-admin acts through the append-only audit repository (ADR-0075/0076)."""

    def __init__(self, repository: ExerciseAuditRepository) -> None:
        self._repository = repository

    def _append(
        self, exercise_id: int, actor: str, intent: AuditIntent | None
    ) -> AuditRecord | None:
        """Persist a decided intent, or record nothing when the act was a no-op."""

        if intent is None:
            return None
        return self._repository.record(
            exercise_id=exercise_id,
            actor=actor,
            action=intent.action,
            detail=intent.detail,
        )

    def record_provenance_change(
        self, exercise_id: int, actor: str, *, before: str, after: str
    ) -> AuditRecord | None:
        """Record a deliberate Provenance change, or nothing when the tier is re-affirmed."""

        return self._append(
            exercise_id, actor, audit_provenance_change(before=before, after=after)
        )

    def record_retire_transition(
        self, exercise_id: int, actor: str, *, before_retired: bool, after_retired: bool
    ) -> AuditRecord | None:
        """Record a Retire / un-retire, or nothing when the state is re-affirmed."""

        return self._append(
            exercise_id,
            actor,
            audit_retire_transition(
                before_retired=before_retired, after_retired=after_retired
            ),
        )

    def record_delete(
        self, exercise_id: int, actor: str, *, normalized_name: str
    ) -> AuditRecord:
        """Record a guarded hard delete — always written, keeping the deleted name in detail."""

        intent = audit_hard_delete(normalized_name=normalized_name)
        return self._repository.record(
            exercise_id=exercise_id,
            actor=actor,
            action=intent.action,
            detail=intent.detail,
        )

    def list_for(self, exercise_id: int) -> list[AuditRecord]:
        """Return one Exercise's recorded admin acts, newest first (the admin read route)."""

        return self._repository.list_for(exercise_id)


__all__ = ["AuditTrail"]
