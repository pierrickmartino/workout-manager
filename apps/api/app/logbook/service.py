"""The session-logging path: validate, then persist a performance record.

``log_session`` guards the record side of the plan/record split. Two invariants
hold before anything is written: you may only log a performance of a Session you
own (``SessionNotOwnedError`` otherwise), and every Logged Set must reference a
real catalog Exercise (``UnknownExerciseError`` otherwise). On success it records
a Logged Session — the prescribing Session is read for ownership but never
mutated. Pure orchestration over the repositories; no AI, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)
from app.repositories.session_repository import SessionRepository


class LogSessionError(Exception):
    """Base class for logbook validation failures."""


class SessionNotOwnedError(LogSessionError):
    """The Session being logged is missing or owned by another user."""


class UnknownExerciseError(LogSessionError):
    """A Logged Set references an Exercise that is not in the catalog."""


@dataclass(frozen=True)
class LogSessionRequest:
    """A request to record a performance: which Session, when, and the sets done."""

    session_id: int
    performed_on: date
    logged_sets: list[LoggedSetDraft] = field(default_factory=list)


def log_session(
    request: LogSessionRequest,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    exercises: ExerciseRepository,
    logged: LoggedSessionRepository,
) -> LoggedSessionView:
    """Record a performance of the user's Session, or raise before persisting.

    Raises ``SessionNotOwnedError`` if the Session is not the user's, or
    ``UnknownExerciseError`` if any logged set references an unknown Exercise.
    """

    if sessions.get(request.session_id, clerk_user_id) is None:
        raise SessionNotOwnedError(
            f"Session {request.session_id} is not available to log."
        )

    for logged_set in request.logged_sets:
        if exercises.get(logged_set.exercise_id) is None:
            raise UnknownExerciseError(
                f"Exercise {logged_set.exercise_id} is not in the catalog."
            )

    draft = LoggedSessionDraft(
        session_id=request.session_id,
        performed_on=request.performed_on,
        logged_sets=list(request.logged_sets),
    )
    return logged.create(clerk_user_id, draft)


__all__ = [
    "LogSessionError",
    "SessionNotOwnedError",
    "UnknownExerciseError",
    "LogSessionRequest",
    "log_session",
]
