"""The session-logging path: validate, then persist a performance record.

``log_session`` guards the record side of the plan/record split, for both a
plan-backed performance (of a Session the user owns) and a plan-less one (an ad-hoc
record with no Session behind it, ADR-0031). The invariants that hold before anything
is written: a plan-backed log must name a Session the user owns
(``SessionNotOwnedError`` otherwise); the log-kind boundary rule must be satisfied
(``LogKindError`` otherwise — plan-less requires a training type and forbids a
Completion Outcome); and every Logged Set must reference a real catalog Exercise
(``UnknownExerciseError`` otherwise). The catalog guard and the Performed-Body-Weight
snapshot run for both paths; only the ownership guard is conditional. On success it
records a Logged Session — a prescribing Session, when present, is read for ownership
but never mutated. Pure orchestration over the repositories; no AI, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date

from app.domain.log_kind import LogKindError, resolve_training_type
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository


class LogSessionError(Exception):
    """Base class for logbook validation failures."""


class SessionNotOwnedError(LogSessionError):
    """The Session being logged is missing or owned by another user."""


class UnknownExerciseError(LogSessionError):
    """A Logged Set references an Exercise that is not in the catalog."""


@dataclass(frozen=True)
class LogSessionRequest:
    """A request to record a performance: which Session (if any), when, and the sets.

    ``session_id`` names the prescribing Session, or is ``None`` for a plan-less record
    (ADR-0031). ``training_type`` rides on a plan-less request and is *required* there;
    on a plan-backed request it is ignored (the Session's type wins), so a caller with
    a Session in hand may leave it ``None``.

    ``completion_outcome`` carries the client-declared Completion Outcome (ADR-0013)
    — ``"completed"`` | ``"incomplete"``, or ``None`` when the record does not
    declare one; it is *forbidden* on a plan-less request. ``duration_seconds`` carries
    the recorded Session Duration (ADR-0014) — actual training time in whole seconds,
    or ``None`` when unrecorded."""

    session_id: int | None
    performed_on: date
    training_type: str | None = None
    completion_outcome: str | None = None
    duration_seconds: int | None = None
    logged_sets: list[LoggedSetDraft] = field(default_factory=list)


def log_session(
    request: LogSessionRequest,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    exercises: ExerciseRepository,
    logged: LoggedSessionRepository,
    profiles: ProfileRepository,
) -> LoggedSessionView:
    """Record a performance — plan-backed or plan-less — or raise before persisting.

    Raises ``SessionNotOwnedError`` if a named Session is not the user's,
    ``LogKindError`` if the request violates the plan-backed / plan-less boundary rule
    (ADR-0031), or ``UnknownExerciseError`` if any logged set references an unknown
    Exercise.

    Snapshots the performer's current Profile weight onto every set as its Performed
    Body Weight (ADR-0026) — one performance shares one mass, captured once here at
    the write boundary. When no weight is on file the snapshot is ``None`` and the set
    is left outside strength records rather than resolved against a guessed mass.
    """

    # Ownership is guarded only for a plan-backed log; a plan-less one names no Session.
    session_training_type: str | None = None
    if request.session_id is not None:
        session = sessions.get(request.session_id, clerk_user_id)
        if session is None:
            raise SessionNotOwnedError(
                f"Session {request.session_id} is not available to log."
            )
        session_training_type = session.training_type

    # The boundary rule decides which training type rides on the record and rejects an
    # ill-formed plan-less request (missing training type or a forbidden outcome).
    training_type = resolve_training_type(
        session_id=request.session_id,
        request_training_type=request.training_type,
        completion_outcome=request.completion_outcome,
        session_training_type=session_training_type,
    )

    for logged_set in request.logged_sets:
        if exercises.get(logged_set.exercise_id) is None:
            raise UnknownExerciseError(
                f"Exercise {logged_set.exercise_id} is not in the catalog."
            )

    performed_body_weight = profiles.get_or_create(clerk_user_id).weight_kg
    draft = LoggedSessionDraft(
        session_id=request.session_id,
        training_type=training_type,
        performed_on=request.performed_on,
        completion_outcome=request.completion_outcome,
        duration_seconds=request.duration_seconds,
        logged_sets=[
            replace(logged_set, body_weight_kg=performed_body_weight)
            for logged_set in request.logged_sets
        ],
    )
    return logged.create(clerk_user_id, draft)


__all__ = [
    "LogSessionError",
    "SessionNotOwnedError",
    "UnknownExerciseError",
    "LogKindError",
    "LogSessionRequest",
    "log_session",
]
