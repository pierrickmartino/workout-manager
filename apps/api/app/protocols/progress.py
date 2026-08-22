"""The self-paced protocol view (ADR-0001): which Session comes next, and — with
Progression (ADR-0004) — at what adjusted load.

``protocol_progress`` joins a user-owned Protocol to the user's performance record
and surfaces the *next un-performed Session* — the first Session, in position
order, the user has not yet logged. There is no calendar binding: a missed Session
is simply still next, so the user always picks up where they left off.

``progressed_protocol`` extends that view: it overlays each *upcoming* (un-performed)
Prescription with the deterministic ``next_prescription`` adjustment (recommended
load, or rep target for pure bodyweight) computed from the user's most recent Logged
Sets of that Exercise. Already-performed
Sessions are history and keep their logged load. The overlay is read-only — it
returns fresh view objects and never mutates the stored Protocol (or the cached
artifact behind it).

The module is layered like the rest of the read model (ADR-0018): a **pure** projection
tier (``protocol_progress_from`` / ``progressed_protocol_from``) computes over an
already-loaded history and does no I/O, and a thin **service** tier
(``protocol_progress`` / ``progressed_protocol``) resolves ownership and reads the
history once before delegating. ``current_protocol`` selects across a user's Protocols
by projecting each through the pure tier over one shared history, so choosing the
Current Protocol never re-reads the history per Protocol. No AI, no HTTP."""

from __future__ import annotations

from dataclasses import dataclass, replace

from app.domain.completion import CompletionOutcome
from app.domain.load import parse_load
from app.domain.progression import next_prescription
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetView,
)
from app.repositories.protocol_repository import (
    ProtocolRepository,
    ProtocolSessionView,
    ProtocolView,
)
from app.repositories.session_repository import PrescriptionView


@dataclass(frozen=True)
class _LoadedPrescription:
    """The minimal shape ``next_prescription`` reads: rep target and free-text load."""

    reps: str
    recommended_load: str | None


@dataclass(frozen=True)
class ProtocolProgressView:
    """A Protocol plus its self-paced position: what is done and what is next."""

    protocol: ProtocolView
    next_session: ProtocolSessionView | None
    completed_count: int
    # The ids of Sessions with an advancing Logged Session (ADR-0013) — the frozen
    # prefix the Builder renders read-only and deploy refuses to touch (ADR-0020).
    performed_session_ids: frozenset[int] = frozenset()


def _advances(entry: LoggedSessionView) -> bool:
    """Whether a Logged Session advances its Protocol past the performed Session.

    Only a *Completed* performance advances (ADR-0013): an Incomplete log leaves the
    Session as the Next Session, to be retried. An *undeclared* outcome (``None``)
    still advances — it predates the Completion Outcome and keeps ADR-0001's original
    "any log advances" rule, which the static log form relies on by defaulting to
    Completed.
    """

    return entry.completion_outcome != CompletionOutcome.INCOMPLETE.value


def _advancing_sessions(logged_sessions: list[LoggedSessionView]) -> set[int]:
    """The set of Session ids that have at least one *advancing* Logged Session."""

    return {entry.session_id for entry in logged_sessions if _advances(entry)}


def _progress_over(
    protocol: ProtocolView, performed: set[int]
) -> tuple[int, ProtocolSessionView | None]:
    """The completed count and next un-performed Session over a ProtocolView."""

    completed_count = sum(
        1 for session in protocol.sessions if session.session_id in performed
    )
    next_session = next(
        (
            session
            for session in protocol.sessions
            if session.session_id not in performed
        ),
        None,
    )
    return completed_count, next_session


def protocol_progress_from(
    protocol: ProtocolView, logged_sessions: list[LoggedSessionView]
) -> ProtocolProgressView:
    """The next-un-performed-Session view over an already-loaded history.

    The pure projection tier (mirroring ``project_gamification``): given a resolved
    Protocol and the user's Logged Sessions, no I/O of its own. The next Session is the
    first (by position) the user has not logged an advancing performance of; ``None``
    once every Session has been performed. Callers that already hold the history — a
    request assembling several reads — fan this out with zero extra reads.
    """

    performed = _advancing_sessions(logged_sessions)
    completed_count, next_session = _progress_over(protocol, performed)
    return ProtocolProgressView(
        protocol=protocol,
        next_session=next_session,
        completed_count=completed_count,
        performed_session_ids=frozenset(performed),
    )


def protocol_progress(
    clerk_user_id: str,
    protocol_id: int,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
) -> ProtocolProgressView | None:
    """Return the owner's Protocol with its next un-performed Session, or ``None``.

    ``None`` if the Protocol is missing or owned by another user. The service tier: it
    resolves ownership and reads the history **once**, then delegates to the pure
    ``protocol_progress_from`` (mirroring how ``profile_progress`` loads once and fans
    out to ``project_gamification``).
    """

    protocol = protocols.get(protocol_id, clerk_user_id)
    if protocol is None:
        return None
    return protocol_progress_from(protocol, logged.list_for_user(clerk_user_id))


def latest_sets_by_exercise(
    logged_sessions: list[LoggedSessionView],
) -> dict[int, list[LoggedSetView]]:
    """Map each Exercise to the Logged Sets from its most recent performance.

    ``logged_sessions`` arrives newest-first, so the first time an Exercise is
    seen wins: the user's latest sets for that movement drive its next recommended
    load. Every performance is read — including Incomplete ones — because the sets
    done inside an Incomplete Session are real history.
    """

    latest: dict[int, list[LoggedSetView]] = {}
    for session in logged_sessions:
        by_exercise: dict[int, list[LoggedSetView]] = {}
        for logged_set in session.logged_sets:
            by_exercise.setdefault(logged_set.exercise_id, []).append(logged_set)
        for exercise_id, sets in by_exercise.items():
            latest.setdefault(exercise_id, sets)
    return latest


def progressed_prescription(
    prescription: PrescriptionView, sets: list[LoggedSetView]
) -> PrescriptionView:
    """Overlay the ADR-0004 Progression adjustment onto a Prescription view.

    Delegates to :func:`next_prescription`, which reads the free-text load and rep
    target and returns the stepped values: an external-weight load moves its kg, a
    weighted-bodyweight load its added kg, and a pure-bodyweight movement its rep
    target (ADR-0026); %-1RM, ranges and qualitative loads are left untouched. The
    stored load is a typed ``{kind, text, ...}`` dict, so the stepped load text is
    re-typed through :func:`parse_load` to keep the view a typed Load end to end.

    A **Pinned** Prescription is skipped (ADR-0053): when the user has pinned a rep
    target, its presence suspends read-time Progression for this movement — the stored
    pinned range is surfaced verbatim as the rep target and ``next_prescription`` is not
    applied, so the very logs that earned the Pin can never step it a second time (the
    double-count trap). Un-pinning clears the marker and the overlay resumes stepping
    with no lingering effect and no recomputation of history.
    """

    if prescription.pinned_reps is not None:
        return replace(prescription, reps=prescription.pinned_reps)

    load = prescription.recommended_load
    result = next_prescription(
        _LoadedPrescription(
            reps=prescription.reps,
            recommended_load=load["text"] if load else None,
        ),
        sets,
    )
    adjusted_load = (
        parse_load(result.recommended_load).to_dict()
        if result.recommended_load is not None
        else None
    )
    return replace(prescription, reps=result.reps, recommended_load=adjusted_load)


def _adjusted_session(
    session: ProtocolSessionView,
    latest_sets: dict[int, list[LoggedSetView]],
) -> ProtocolSessionView:
    """A copy of ``session`` with each Prescription progressed (load and reps)."""

    adjusted = [
        progressed_prescription(
            prescription, latest_sets.get(prescription.exercise_id, [])
        )
        for prescription in session.prescriptions
    ]
    return replace(session, prescriptions=adjusted)


def progressed_protocol_from(
    protocol: ProtocolView, logged_sessions: list[LoggedSessionView]
) -> ProtocolProgressView:
    """The progressed-load view over an already-loaded history.

    Like ``protocol_progress_from``, but every *un-performed* Session's recommended
    loads are overlaid with the ``next_load`` adjustment from the user's latest Logged
    Sets. Performed Sessions are left as logged. The returned view is freshly built —
    the stored Protocol (and any cached source) is never mutated. Pure: no I/O, so a
    caller iterating a user's Protocols reuses one history instead of re-reading it per
    Protocol (ADR-0018's fan-out convention).
    """

    # Advancement keys off a *Completed* log (ADR-0013), but the Progression overlay
    # still reads *every* logged set: the sets done inside an Incomplete performance
    # are real history (volume, PRs) and legitimately drive the next recommended load.
    performed = _advancing_sessions(logged_sessions)
    latest_sets = latest_sets_by_exercise(logged_sessions)

    sessions = [
        session
        if session.session_id in performed
        else _adjusted_session(session, latest_sets)
        for session in protocol.sessions
    ]
    adjusted_protocol = replace(protocol, sessions=sessions)

    completed_count, next_session = _progress_over(adjusted_protocol, performed)
    return ProtocolProgressView(
        protocol=adjusted_protocol,
        next_session=next_session,
        completed_count=completed_count,
        performed_session_ids=frozenset(performed),
    )


def progressed_protocol(
    clerk_user_id: str,
    protocol_id: int,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
) -> ProtocolProgressView | None:
    """Return the owner's Protocol with upcoming loads progressed, or ``None``.

    The service tier for a single Protocol: resolve ownership, read the history once,
    delegate to the pure ``progressed_protocol_from``.
    """

    protocol = protocols.get(protocol_id, clerk_user_id)
    if protocol is None:
        return None
    return progressed_protocol_from(protocol, logged.list_for_user(clerk_user_id))


def current_protocol(
    clerk_user_id: str,
    *,
    protocols: ProtocolRepository,
    logged_sessions: list[LoggedSessionView],
) -> ProtocolProgressView | None:
    """Return the user's Current Protocol as a progressed view, or ``None``.

    The Current Protocol is the user's *most-recently-adopted* Protocol that still
    holds an un-performed Session (ADR-0008): Home focuses on the plan the user is
    actively working through, and never dead-ends on a finished one. Fully-performed
    Protocols are passed over in favour of an older in-progress one. Returns ``None``
    when the user owns no Protocol, or when every owned Protocol is complete.

    Takes the **already-loaded** history and projects each candidate Protocol through
    the pure ``progressed_protocol_from`` — so selecting the Current Protocol reads the
    history *once for the whole request*, however many Protocols the user owns, instead
    of re-reading it per Protocol (issue: the K+1 this fixes; ADR-0018's convention).
    The caller (Home) already holds the history it read for Readiness and gamification,
    so the whole ``GET /api/home`` request makes a single history read. Standalone
    Sessions are not eligible — only adopted Protocols are considered.
    """

    for protocol in protocols.list_for_user(clerk_user_id):
        progress = progressed_protocol_from(protocol, logged_sessions)
        if progress.next_session is not None:
            return progress
    return None


__all__ = [
    "ProtocolProgressView",
    "protocol_progress",
    "protocol_progress_from",
    "progressed_protocol",
    "progressed_protocol_from",
    "current_protocol",
    "latest_sets_by_exercise",
    "progressed_prescription",
]
