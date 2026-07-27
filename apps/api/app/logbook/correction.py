"""Log Correction (ADR-0034): edit the contents of a Logged Session after the fact.

``correct_session`` is the record-side sibling of ``log_session``. Where ``log_session``
appends a new performance, this replaces the editable contents of an existing one —
its Logged Sets (exercise, Quantity, Load, perceived difficulty), ``performed_on``,
``duration_seconds``, and, for a plan-less record only, its ``training_type``.

Three things make correction *safe*, and each is enforced here rather than at the
route (unlike create, ADR-0031, edit needs no plan-backed / plan-less route split —
the boundary rule is read off the record):

- **Ownership** — the log must be the caller's (``LogNotFoundError`` → ``404``);
- **The boundary rule** — the plan-backed / plan-less shape is derived from the
  *existing* record: a plan-backed record keeps the training type derived from its
  Session (the request's is ignored, as at create); a plan-less record takes a
  required training type from the request (``LogKindError`` otherwise). The Completion
  Outcome is *preserved* from the record, never taken from the request;
- **Mass carry-forward** — the Performed Body Weight is reused from the record and
  applied to every replacement set, including newly added ones (ADR-0034/0026); any
  client-sent body weight is ignored, and a record with no mass on file stays ``None``.
  Editing ``performed_on`` therefore never re-derives the snapshotted mass.

This slice excludes the two hole-creating operations (delete, outcome→Incomplete), so
no contiguity gate is needed. Pure orchestration over the repositories; no AI, no HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date

from app.domain.log_kind import resolve_training_type
from app.logbook.service import UnknownExerciseError
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)


class LogNotFoundError(Exception):
    """The Logged Session being corrected is missing or owned by another user."""


@dataclass(frozen=True)
class CorrectSessionRequest:
    """A request to correct a Logged Session's contents (ADR-0034).

    ``log_id`` names the record to edit. ``training_type`` rides only on a plan-less
    correction (there is no Session to derive it from) and is required there; on a
    plan-backed record it is ignored (the Session's type, carried on the record, wins),
    so a caller need not restate it. The Completion Outcome and ``session_id`` are not
    part of the request — they are preserved from the existing record."""

    log_id: int
    performed_on: date
    training_type: str | None = None
    duration_seconds: int | None = None
    logged_sets: list[LoggedSetDraft] = field(default_factory=list)


def _carried_body_weight(existing: LoggedSessionView) -> float | None:
    """The Performed Body Weight to carry onto the replacement (ADR-0034).

    One performance shares one mass, so it is read off the record's first set. A record
    logged with no mass on file stays ``None`` — the honest silence ADR-0026 chose over
    guessing — never re-read from today's Profile."""

    for logged_set in existing.logged_sets:
        return logged_set.body_weight_kg
    return None


def correct_session(
    request: CorrectSessionRequest,
    clerk_user_id: str,
    *,
    exercises: ExerciseRepository,
    logged: LoggedSessionRepository,
) -> LoggedSessionView:
    """Apply a Log Correction, or raise before persisting.

    Raises ``LogNotFoundError`` when the log is not the caller's, ``LogKindError`` when
    the plan-less boundary rule is violated (a missing training type), and
    ``UnknownExerciseError`` when any replacement set references an unknown Exercise.
    """

    existing = logged.get(request.log_id, clerk_user_id)
    if existing is None:
        raise LogNotFoundError(f"Log {request.log_id} is not available to correct.")

    # The boundary rule is read off the record: session_id decides plan-backed vs
    # plan-less, and the record's own training type is authoritative for a plan-backed
    # correction (as the Session's is at create). The Completion Outcome is preserved,
    # so passing the record's satisfies the plan-less "no outcome" rule (it is None
    # there by construction).
    training_type = resolve_training_type(
        session_id=existing.session_id,
        request_training_type=request.training_type,
        completion_outcome=existing.completion_outcome,
        session_training_type=existing.training_type,
    )

    for logged_set in request.logged_sets:
        if exercises.get(logged_set.exercise_id) is None:
            raise UnknownExerciseError(
                f"Exercise {logged_set.exercise_id} is not in the catalog."
            )

    body_weight = _carried_body_weight(existing)
    draft = LoggedSessionDraft(
        session_id=existing.session_id,
        training_type=training_type,
        performed_on=request.performed_on,
        completion_outcome=existing.completion_outcome,
        duration_seconds=request.duration_seconds,
        logged_sets=[
            replace(logged_set, body_weight_kg=body_weight)
            for logged_set in request.logged_sets
        ],
    )
    updated = logged.update(request.log_id, clerk_user_id, draft)
    if updated is None:  # pragma: no cover - ownership already resolved above
        raise LogNotFoundError(f"Log {request.log_id} is not available to correct.")
    return updated


__all__ = [
    "LogNotFoundError",
    "UnknownExerciseError",
    "CorrectSessionRequest",
    "correct_session",
]
