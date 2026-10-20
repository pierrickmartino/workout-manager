"""The self-paced protocol view (ADR-0001): which Session comes next, and — with
Progression (ADR-0004) — at what adjusted load.

``protocol_progress`` joins a user-owned Protocol to the user's performance record
and surfaces the *next un-performed Session* — the first Session, in position
order, the user has not yet logged. There is no calendar binding: a missed Session
is simply still next, so the user always picks up where they left off.

``progressed_protocol`` extends that view: it overlays each *upcoming* (un-performed)
Prescription with the read-time Progression step (``app.progression.overlay``) —
recommended load, or rep target for pure bodyweight — computed from the user's record of
that Exercise. Already-performed
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

from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime

from app.domain.completion import CompletionOutcome
from app.progression.overlay import ProgressionOverlay
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)
from app.repositories.protocol_repository import (
    ProtocolRepository,
    ProtocolSessionView,
    ProtocolView,
)


@dataclass(frozen=True)
class ProtocolProgressView:
    """A Protocol plus its self-paced position: what is done and what is next."""

    protocol: ProtocolView
    next_session: ProtocolSessionView | None
    completed_count: int
    # The ids of Sessions with an advancing Logged Session (ADR-0013) — the frozen
    # prefix the Builder renders read-only and deploy refuses to touch (ADR-0020).
    performed_session_ids: frozenset[int] = frozenset()
    # Each performed Session id → the id of the Logged Session that advanced it — the
    # *record* a performed schedule card links to (plan≠record). Distinct from the set
    # above, which is only membership; this carries the record to open (Q7). Empty on a
    # view built without a history (authoring/deploy), so those serialize null links.
    performed_log_ids: Mapping[int, int] = field(default_factory=dict)


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


def _advancing_log_ids(logged_sessions: list[LoggedSessionView]) -> dict[int, int]:
    """Map each performed Session id to its advancing Logged Session's id.

    ``logged_sessions`` arrives newest-first (the repository contract), so the first
    advancing log seen per Session wins: the *most recent* Completed performance is the
    record a performed schedule card opens. Non-advancing (Incomplete) logs are skipped,
    and a plan-less record (``session_id`` is ``None``) carries no Session to key on.
    """

    log_ids: dict[int, int] = {}
    for entry in logged_sessions:
        if entry.session_id is None or not _advances(entry):
            continue
        log_ids.setdefault(entry.session_id, entry.id)
    return log_ids


def last_performed_on_by_session(
    logged_sessions: list[LoggedSessionView],
) -> dict[int, date]:
    """Map each performed Session id to the date of its latest *advancing* performance.

    Its keys are exactly the performed Sessions (ADR-0013: an Incomplete log does not
    perform a Session), so a caller that also needs the date reads both off one pass.
    Plan-less records carry no Session and are skipped."""

    dates: dict[int, date] = {}
    for entry in logged_sessions:
        if entry.session_id is None or not _advances(entry):
            continue
        previous = dates.get(entry.session_id)
        if previous is None or entry.performed_on > previous:
            dates[entry.session_id] = entry.performed_on
    return dates


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
        performed_log_ids=_advancing_log_ids(logged_sessions),
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


def _adjusted_session(
    session: ProtocolSessionView, overlay: ProgressionOverlay
) -> ProtocolSessionView:
    """A copy of ``session`` with each Prescription progressed (load and reps)."""

    adjusted = [
        overlay.progress(prescription).prescription
        for prescription in session.prescriptions
    ]
    return replace(session, prescriptions=adjusted)


def progressed_protocol_from(
    protocol: ProtocolView, logged_sessions: list[LoggedSessionView]
) -> ProtocolProgressView:
    """The progressed-load view over an already-loaded history.

    Like ``protocol_progress_from``, but every *un-performed* Session's recommended
    loads are overlaid with the Progression step (``ProgressionOverlay``) over that
    history. Performed Sessions are left as logged. The returned view is freshly built —
    the stored Protocol (and any cached source) is never mutated. Pure: no I/O, so a
    caller iterating a user's Protocols reuses one history instead of re-reading it per
    Protocol (ADR-0018's fan-out convention).
    """

    # Advancement keys off a *Completed* log (ADR-0013), but the Progression overlay
    # still reads *every* logged set: the sets done inside an Incomplete performance
    # are real history (volume, PRs) and legitimately drive the next recommended load.
    performed = _advancing_sessions(logged_sessions)
    overlay = ProgressionOverlay.from_history(logged_sessions)

    sessions = [
        session
        if session.session_id in performed
        else _adjusted_session(session, overlay)
        for session in protocol.sessions
    ]
    adjusted_protocol = replace(protocol, sessions=sessions)

    completed_count, next_session = _progress_over(adjusted_protocol, performed)
    return ProtocolProgressView(
        protocol=adjusted_protocol,
        next_session=next_session,
        completed_count=completed_count,
        performed_session_ids=frozenset(performed),
        performed_log_ids=_advancing_log_ids(logged_sessions),
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


# Stands in for a never-made-Current Protocol's missing stamp, only so it sorts; the leading
# flag in the key already places every such Protocol after every made-Current one.
_NEVER_MADE_CURRENT = datetime.min.replace(tzinfo=UTC)


def is_selectable(protocol: ProtocolView) -> bool:
    """Whether ``protocol`` may be selected as Current: it has been made Current at least
    once. A Curated Protocol a Sensitive-Constraint user adopted set aside has not, so it
    stays set aside until they Switch to it (ADR-0130, ADR-0058)."""

    return protocol.made_current_at is not None


def by_made_current(protocols: list[ProtocolView]) -> list[ProtocolView]:
    """``protocols`` most-recently-made-Current first, ties broken by the higher id, and
    never-made-Current Protocols last.

    The one order Current Protocol selection walks (ADR-0125): the first unfinished
    selectable Protocol in it is Current. Shared by Home and the Protocols index so the two
    can never disagree about which Protocol is Current."""

    return sorted(
        protocols,
        key=lambda protocol: (
            is_selectable(protocol),
            protocol.made_current_at or _NEVER_MADE_CURRENT,
            protocol.id,
        ),
        reverse=True,
    )


def current_protocol(
    clerk_user_id: str,
    *,
    protocols: ProtocolRepository,
    logged_sessions: list[LoggedSessionView],
) -> ProtocolProgressView | None:
    """Return the user's Current Protocol as a progressed view, or ``None``.

    The Current Protocol is the user's *most-recently-made-Current* Protocol — latest
    ``made_current_at``, ties broken by the higher id (ADR-0125) — that still holds an
    un-performed Session (ADR-0008): Home focuses on the plan the user is actively
    working through, and never dead-ends on a finished one. Adopting stamps
    ``made_current_at``, so a newly generated Protocol supersedes; fully-performed
    Protocols are passed over in favour of the next most-recently-Current unfinished
    one. Returns ``None`` when the user owns no Protocol, or when every owned Protocol
    is complete. The order is applied here, explicitly, rather than borrowed from the
    repository's list order (``created_at``), which its other callers rely on.

    Takes the **already-loaded** history and projects each candidate Protocol through
    the pure ``progressed_protocol_from`` — so selecting the Current Protocol reads the
    history *once for the whole request*, however many Protocols the user owns, instead
    of re-reading it per Protocol (issue: the K+1 this fixes; ADR-0018's convention).
    The caller (Home) already holds the history it read for Readiness and gamification,
    so the whole ``GET /api/home`` request makes a single history read. Standalone
    Sessions are not eligible — only adopted Protocols are considered.
    """

    for protocol in by_made_current(protocols.list_for_user(clerk_user_id)):
        if not is_selectable(protocol):
            break  # every Protocol from here on was adopted set aside, never made Current
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
    "by_made_current",
    "is_selectable",
    "last_performed_on_by_session",
]
