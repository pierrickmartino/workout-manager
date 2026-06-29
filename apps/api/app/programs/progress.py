"""The self-paced program view (ADR-0001): which Session comes next, and — with
Progression (ADR-0004) — at what adjusted load.

``program_progress`` joins a user-owned Program to the user's performance record
and surfaces the *next un-performed Session* — the first Session, in position
order, the user has not yet logged. There is no calendar binding: a missed Session
is simply still next, so the user always picks up where they left off.

``progressed_program`` extends that view: it overlays each *upcoming* (un-performed)
Prescription's recommended load with the deterministic ``next_load`` adjustment
computed from the user's most recent Logged Sets of that Exercise. Already-performed
Sessions are history and keep their logged load. The overlay is read-only — it
returns fresh view objects and never mutates the stored Program (or the cached
artifact behind it). Pure orchestration over the Program and Logged-Session
repositories; no AI, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass, replace

from app.domain.progression import next_load
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetView,
)
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


def _progress_over(
    program: ProgramView, performed: set[int]
) -> tuple[int, ProgramSessionView | None]:
    """The completed count and next un-performed Session over a ProgramView."""

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
    return completed_count, next_session


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
    completed_count, next_session = _progress_over(program, performed)
    return ProgramProgressView(
        program=program,
        next_session=next_session,
        completed_count=completed_count,
    )


def _latest_sets_by_exercise(
    logged_sessions: list[LoggedSessionView],
) -> dict[int, list[LoggedSetView]]:
    """Map each Exercise to the Logged Sets from its most recent performance.

    ``logged_sessions`` arrives newest-first, so the first time an Exercise is
    seen wins: the user's latest sets for that movement drive its next recommended
    load.
    """

    latest: dict[int, list[LoggedSetView]] = {}
    for session in logged_sessions:
        by_exercise: dict[int, list[LoggedSetView]] = {}
        for logged_set in session.logged_sets:
            by_exercise.setdefault(logged_set.exercise_id, []).append(logged_set)
        for exercise_id, sets in by_exercise.items():
            latest.setdefault(exercise_id, sets)
    return latest


def _adjusted_session(
    session: ProgramSessionView,
    latest_sets: dict[int, list[LoggedSetView]],
) -> ProgramSessionView:
    """A copy of ``session`` with each Prescription's load progressed."""

    adjusted = [
        replace(
            prescription,
            recommended_load=next_load(
                prescription, latest_sets.get(prescription.exercise_id, [])
            ),
        )
        for prescription in session.prescriptions
    ]
    return replace(session, prescriptions=adjusted)


def progressed_program(
    clerk_user_id: str,
    program_id: int,
    *,
    programs: ProgramRepository,
    logged: LoggedSessionRepository,
) -> ProgramProgressView | None:
    """Return the owner's Program with upcoming loads progressed, or ``None``.

    Like ``program_progress``, but every *un-performed* Session's recommended loads
    are overlaid with the ``next_load`` adjustment from the user's latest Logged
    Sets. Performed Sessions are left as logged. The returned view is freshly built
    — the stored Program (and any cached source) is never mutated.
    """

    program = programs.get(program_id, clerk_user_id)
    if program is None:
        return None

    logged_sessions = logged.list_for_user(clerk_user_id)
    performed = {entry.session_id for entry in logged_sessions}
    latest_sets = _latest_sets_by_exercise(logged_sessions)

    sessions = [
        session
        if session.session_id in performed
        else _adjusted_session(session, latest_sets)
        for session in program.sessions
    ]
    adjusted_program = replace(program, sessions=sessions)

    completed_count, next_session = _progress_over(adjusted_program, performed)
    return ProgramProgressView(
        program=adjusted_program,
        next_session=next_session,
        completed_count=completed_count,
    )


__all__ = ["ProgramProgressView", "program_progress", "progressed_program"]
