"""Repository for the append-only admin audit trail (ADR-0075/0076).

The persistence seam for the exercise-admin audit trail: the consequential admin acts on a
catalog Exercise — deliberate Provenance change first (ADR-0075), retire / un-retire / hard
delete later (ADR-0076). The contract is deliberately tiny and one-directional: ``record``
**appends** one immutable row and ``list_for`` reads a single Exercise's trail, newest
first. There is no update or delete — the trail is append-only, so trust changes stay
traceable. Reads return an ``AuditRecord`` view so consumers never touch the ORM. SQLModel-
backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import ExerciseAdminAudit, _utcnow
from app.domain.exercise_audit import AuditAction


@dataclass(frozen=True)
class AuditRecord:
    """One recorded admin act, ready to serialize — the ORM never leaves the repository.

    ``action`` is the raw ``AuditAction`` value and ``detail`` the act's payload (for a
    provenance change, ``{"from": ..., "to": ...}``). Frozen: a read-back audit row is
    settled history and is never mutated."""

    id: int
    exercise_id: int
    actor: str
    action: str
    detail: dict[str, str]
    created_at: datetime


class ExerciseAuditRepository(Protocol):
    def record(
        self,
        *,
        exercise_id: int,
        actor: str,
        action: AuditAction,
        detail: Mapping[str, str],
    ) -> AuditRecord:
        """Append one admin act to ``exercise_id``'s trail and return the stored record.

        Append-only: this only ever inserts, never updating or removing a prior row, so a
        trust change stays traceable forever (ADR-0075)."""
        ...

    def list_for(self, exercise_id: int) -> list[AuditRecord]:
        """Return ``exercise_id``'s recorded acts, newest first (admin read)."""
        ...


def _view(row: ExerciseAdminAudit) -> AuditRecord:
    return AuditRecord(
        id=row.id,
        exercise_id=row.exercise_id,
        actor=row.actor,
        action=row.action,
        detail=dict(row.detail),
        created_at=row.created_at,
    )


class SqlExerciseAuditRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def record(
        self,
        *,
        exercise_id: int,
        actor: str,
        action: AuditAction,
        detail: Mapping[str, str],
    ) -> AuditRecord:
        row = ExerciseAdminAudit(
            exercise_id=exercise_id,
            actor=actor,
            action=action.value,
            detail=dict(detail),
        )
        self._session.add(row)
        self._session.commit()
        self._session.refresh(row)
        return _view(row)

    def list_for(self, exercise_id: int) -> list[AuditRecord]:
        statement = (
            select(ExerciseAdminAudit)
            .where(ExerciseAdminAudit.exercise_id == exercise_id)
            # Newest first; the id tiebreaks acts sharing a timestamp so the order is total
            # and stable even when two acts land in the same instant.
            .order_by(
                ExerciseAdminAudit.created_at.desc(), ExerciseAdminAudit.id.desc()
            )
        )
        return [_view(row) for row in self._session.exec(statement).all()]


class InMemoryExerciseAuditRepository:
    def __init__(self) -> None:
        self._rows: list[ExerciseAdminAudit] = []
        self._next_id = 1

    def record(
        self,
        *,
        exercise_id: int,
        actor: str,
        action: AuditAction,
        detail: Mapping[str, str],
    ) -> AuditRecord:
        row = ExerciseAdminAudit(
            id=self._next_id,
            exercise_id=exercise_id,
            actor=actor,
            action=action.value,
            detail=dict(detail),
            created_at=_utcnow(),
        )
        self._next_id += 1
        self._rows.append(row)
        return _view(row)

    def list_for(self, exercise_id: int) -> list[AuditRecord]:
        owned = [row for row in self._rows if row.exercise_id == exercise_id]
        # Newest first, id as the tiebreak so acts sharing a timestamp keep a total order —
        # the same ordering the SQL query applies.
        owned.sort(key=lambda row: (row.created_at, row.id), reverse=True)
        return [_view(row) for row in owned]


__all__ = [
    "AuditRecord",
    "ExerciseAuditRepository",
    "SqlExerciseAuditRepository",
    "InMemoryExerciseAuditRepository",
]
