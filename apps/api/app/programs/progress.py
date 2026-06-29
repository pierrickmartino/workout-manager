"""The self-paced program view (ADR-0001): which Session comes next.

``program_progress`` joins a user-owned Program to the user's performance record
and surfaces the *next un-performed Session* — the first Session, in position
order, the user has not yet logged. There is no calendar binding: a missed Session
is simply still next, so the user always picks up where they left off. Pure
orchestration over the Program and Logged-Session repositories; no AI, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass

from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.program_repository import (
    ProgramRepository,
    ProgramSessionView,
    ProgramView,
)


@dataclass(frozen=True)
class ProgramProgressView:
    """A Program plus its self-paced position: what is done and what is next."""

    program: ProgramView
    next_session: ProgramSessionView | None
    completed_count: int


def program_progress(
    clerk_user_id: str,
    program_id: int,
    *,
    programs: ProgramRepository,
    logged: LoggedSessionRepository,
) -> ProgramProgressView | None:
    """Return the owner's Program with its next un-performed Session, or ``None``.

    ``None`` if the Program is missing or owned by another user. The next Session
    is the first (by position) whose underlying Session the user has not logged a
    performance of; ``None`` once every Session has been performed.
    """

    program = programs.get(program_id, clerk_user_id)
    if program is None:
        return None

    performed = {entry.session_id for entry in logged.list_for_user(clerk_user_id)}
    completed_count = sum(
        1 for session in program.sessions if session.session_id in performed
    )
    next_session = next(
        (
            session
            for session in program.sessions
            if session.session_id not in performed
        ),
        None,
    )
    return ProgramProgressView(
        program=program,
        next_session=next_session,
        completed_count=completed_count,
    )


__all__ = ["ProgramProgressView", "program_progress"]
