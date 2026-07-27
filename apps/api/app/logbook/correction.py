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

from app.domain.completion import CompletionOutcome
from app.domain.contiguity import CorrectionOperation, evaluate_contiguity
from app.domain.log_kind import resolve_training_type
from app.logbook.service import UnknownExerciseError
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)
from app.repositories.protocol_repository import ProtocolRepository


class LogNotFoundError(Exception):
    """The Logged Session being corrected is missing or owned by another user."""


class ContiguityError(Exception):
    """A correction is refused because it would break the gap-free performed sequence
    (ADR-0034): a tail-first delete/flip whose Session sits before a performed one."""


@dataclass(frozen=True)
class CorrectSessionRequest:
    """A request to correct a Logged Session's contents (ADR-0034).

    ``log_id`` names the record to edit. ``training_type`` rides only on a plan-less
    correction (there is no Session to derive it from) and is required there; on a
    plan-backed record it is ignored (the Session's type, carried on the record, wins),
    so a caller need not restate it.

    ``completion_outcome`` corrects the Completion Outcome of a *plan-backed* record
    (ADR-0013): ``"completed"`` | ``"incomplete"``. ``None`` means "leave it unchanged"
    — the record's own outcome is preserved (a contents-only correction). A plan-less
    record must never supply one (it gates no Protocol); doing so is a boundary violation.
    ``session_id`` is not part of the request — it is immutable and preserved."""

    log_id: int
    performed_on: date
    training_type: str | None = None
    completion_outcome: str | None = None
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
    protocols: ProtocolRepository | None = None,
) -> LoggedSessionView:
    """Apply a Log Correction, or raise before persisting.

    Raises ``LogNotFoundError`` when the log is not the caller's, ``LogKindError`` when
    the plan-less boundary rule is violated (a missing training type, or a Completion
    Outcome on a plan-less record), ``UnknownExerciseError`` when any replacement set
    references an unknown Exercise, and ``ContiguityError`` when correcting the
    Completion Outcome to Incomplete would leave a gap in the performed sequence.

    ``protocols`` is only consulted when a Completion Outcome correction flips a
    plan-backed record to Incomplete — the one hole-creating outcome change (ADR-0034),
    which the pure contiguity gate must vet. The route always supplies it.
    """

    existing = logged.get(request.log_id, clerk_user_id)
    if existing is None:
        raise LogNotFoundError(f"Log {request.log_id} is not available to correct.")

    # The boundary rule is read off the record: session_id decides plan-backed vs
    # plan-less, and the record's own training type is authoritative for a plan-backed
    # correction (as the Session's is at create). The *request's* Completion Outcome is
    # passed through so the plan-less "no outcome" rule rejects one supplied on an
    # ad-hoc record (LogKindError → 422); on a plan-backed record it is ignored here.
    training_type = resolve_training_type(
        session_id=existing.session_id,
        request_training_type=request.training_type,
        completion_outcome=request.completion_outcome,
        session_training_type=existing.training_type,
    )

    # An absent outcome preserves the record's; a supplied one is the correction. Only a
    # plan-backed record can reach a non-None outcome (the plan-less case raised above).
    new_outcome = (
        request.completion_outcome
        if request.completion_outcome is not None
        else existing.completion_outcome
    )

    for logged_set in request.logged_sets:
        if exercises.get(logged_set.exercise_id) is None:
            raise UnknownExerciseError(
                f"Exercise {logged_set.exercise_id} is not in the catalog."
            )

    _guard_outcome_change(
        existing=existing,
        new_outcome=new_outcome,
        clerk_user_id=clerk_user_id,
        protocols=protocols,
        logged=logged,
    )

    body_weight = _carried_body_weight(existing)
    draft = LoggedSessionDraft(
        session_id=existing.session_id,
        training_type=training_type,
        performed_on=request.performed_on,
        completion_outcome=new_outcome,
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


def _guard_outcome_change(
    *,
    existing: LoggedSessionView,
    new_outcome: str | None,
    clerk_user_id: str,
    protocols: ProtocolRepository | None,
    logged: LoggedSessionRepository,
) -> None:
    """Run the contiguity gate when a Completion Outcome correction flips a plan-backed
    record to Incomplete — the only outcome change that can punch a hole (ADR-0034).

    The reverse (Incomplete→Completed) only *fills* the performed set, so it is always
    allowed and never consulted here. A plan-less record carries no outcome and reaches
    this with an unchanged (None) value, so it too is a no-op."""

    incomplete = CompletionOutcome.INCOMPLETE.value
    flips_to_incomplete = (
        existing.session_id is not None
        and new_outcome != existing.completion_outcome
        and new_outcome == incomplete
    )
    if not flips_to_incomplete:
        return

    history = logged.list_for_user(clerk_user_id)
    order = _parent_protocol_order(existing.session_id, clerk_user_id, protocols)
    verdict = evaluate_contiguity(
        target=existing,
        operation=CorrectionOperation.FLIP_TO_INCOMPLETE,
        history=history,
        protocol_session_order=order,
    )
    if not verdict.allowed:
        raise ContiguityError(verdict.reason)


def _parent_protocol_order(
    session_id: int | None,
    clerk_user_id: str,
    protocols: ProtocolRepository | None,
) -> list[int]:
    """The parent Protocol's Session ids in position order, for the contiguity gate.

    Empty when the record is plan-less (``session_id is None``), no repository was
    supplied, or the Session belongs to no Protocol (a standalone generated Session) —
    in each case there is no later position a delete or flip could un-settle. Mirrors how
    ``current_protocol`` iterates the user's Protocols; the gate needs only the ordering,
    not the prescriptions."""

    if session_id is None or protocols is None:
        return []
    for protocol in protocols.list_for_user(clerk_user_id):
        order = [session.session_id for session in protocol.sessions]
        if session_id in order:
            return order
    return []


def delete_session(
    log_id: int,
    clerk_user_id: str,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
) -> None:
    """Delete a Logged Session, or raise before removing anything (ADR-0034).

    Resolves ownership (``LogNotFoundError`` → ``404``), then runs the pure contiguity
    gate over the user's history and the parent Protocol's ordering: a delete that would
    remove a mid-Protocol Session while a later-positioned Session is performed is refused
    (``ContiguityError`` → ``409``, tail-first). Otherwise the record and its Logged Sets
    are removed; the read-time projections (advancement, XP, PRs, Streak, Achievements,
    analytics) recompute from the record for free on the next read. No AI, no HTTP.
    """

    existing = logged.get(log_id, clerk_user_id)
    if existing is None:
        raise LogNotFoundError(f"Log {log_id} is not available to delete.")

    history = logged.list_for_user(clerk_user_id)
    order = _parent_protocol_order(existing.session_id, clerk_user_id, protocols)
    verdict = evaluate_contiguity(
        target=existing,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=order,
    )
    if not verdict.allowed:
        raise ContiguityError(verdict.reason)

    logged.delete(log_id, clerk_user_id)


__all__ = [
    "LogNotFoundError",
    "ContiguityError",
    "UnknownExerciseError",
    "CorrectSessionRequest",
    "correct_session",
    "delete_session",
]
