"""The Pin flow: a user-set bodyweight rep target that suspends read-time Progression.

``pin_prescription`` writes a user-chosen rep range onto a bodyweight Exercise Prescription's
next un-performed occurrence (ADR-0053); ``clear_pin`` is its inverse (un-pin). Both mutate only
the user's own Session copy and **refuse a performed Session** — the plan/record guard: a Session
the user has already logged is settled record and its plan position is never rewritten
(ADR-0020). The new range is validated (a sane, non-empty range with ``floor <= ceiling``) before
any write.

This mirrors the Substitution service seam: the repository does the owner-scoped persistence, and
this service owns the cross-aggregate concerns — the performed-Session guard (read live from the
Logged Session record) and the range validation — raising typed errors the route maps to ``404`` /
``409``. Keeping the performed guard here, over live logs, means an un-pin followed by a Log
Correction reads the true current state rather than a stale marker.
"""

from __future__ import annotations

from app.domain.load import LoadKind, parse_load
from app.domain.progression import parse_rep_range
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.session_repository import (
    PrescriptionView,
    SessionRepository,
    SessionView,
)


class SessionNotFound(Exception):
    """The Session does not exist or is owned by another user."""


class PrescriptionNotFound(Exception):
    """The Session has no Exercise Prescription at the requested position."""


class SessionAlreadyPerformed(Exception):
    """The Session has a Logged Session — settled record, so its plan is never rewritten
    (ADR-0020). A Pin/un-pin only ever targets an un-performed occurrence."""


class InvalidPinTarget(Exception):
    """The requested rep range is not a sane, non-empty range with ``floor <= ceiling``."""


class PinTargetNotBodyweight(Exception):
    """The target Prescription is not a *pure-bodyweight* movement. Pin governs the rep
    target only — a loaded or weighted-bodyweight movement progresses on Load, not reps,
    so pinning reps there is refused (the overlay-skip must not freeze a load axis)."""


def _find_prescription(view: SessionView, position: int) -> PrescriptionView | None:
    for prescription in view.prescriptions:
        if prescription.position == position:
            return prescription
    return None


def _is_performed(
    logged: LoggedSessionRepository, clerk_user_id: str, session_id: int
) -> bool:
    """Whether the user has any Logged Session for this Session — the performed guard.

    Any performance (even an Incomplete one) makes the Session settled record whose plan
    position must not be rewritten. Read live from the record so it always reflects the
    current history (a later Log Correction delete would un-perform it)."""

    return any(
        entry.session_id == session_id
        for entry in logged.list_for_user(clerk_user_id)
    )


def _is_pure_bodyweight(prescription: PrescriptionView) -> bool:
    """Whether the Prescription is a pure-bodyweight movement — reps are its progression
    axis (ADR-0026), so a rep target is the thing to pin. A loaded, %-1RM, weighted
    (added-load) or load-less Prescription progresses on Load and is not pinnable."""

    load = prescription.recommended_load
    if load is None:
        return False
    parsed = parse_load(load["text"])
    return parsed.kind is LoadKind.BODYWEIGHT and parsed.added_kg is None


def _guard_owned_unperformed(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
) -> PrescriptionView:
    """The guards shared by Pin and un-pin: the user owns the Session
    (``SessionNotFound``), it has a Prescription at ``position`` (``PrescriptionNotFound``),
    and it is un-performed (``SessionAlreadyPerformed``). Returns that Prescription."""

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    prescription = _find_prescription(view, position)
    if prescription is None:
        raise PrescriptionNotFound(position)

    if _is_performed(logged, clerk_user_id, session_id):
        raise SessionAlreadyPerformed(session_id)

    return prescription


def pin_prescription(
    session_id: int,
    clerk_user_id: str,
    position: int,
    new_target: str,
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
) -> SessionView:
    """Pin ``new_target`` onto the prescription at ``position`` in the owner's Session.

    Validates the whole request before any write: the user owns the Session
    (``SessionNotFound``), it has a prescription at ``position`` (``PrescriptionNotFound``),
    the Session is un-performed (``SessionAlreadyPerformed``), the movement is pure
    bodyweight (``PinTargetNotBodyweight``), and ``new_target`` is a sane range
    (``InvalidPinTarget``). On success the pinned range is stored on the user's own copy —
    its presence suspends read-time Progression for that movement — and the updated Session
    is returned. Nothing else on the plan or the record is touched.
    """

    prescription = _guard_owned_unperformed(
        session_id, clerk_user_id, position, sessions=sessions, logged=logged
    )

    # Bodyweight rep target only (ADR-0026, #369): a loaded/weighted movement progresses on
    # Load, so pinning its reps — which the overlay-skip would freeze — is refused.
    if not _is_pure_bodyweight(prescription):
        raise PinTargetNotBodyweight(position)

    parsed = parse_rep_range(new_target)
    if parsed is None:
        raise InvalidPinTarget(new_target)
    floor, ceiling = parsed
    # Re-emit in the target's own shape: a single number stays single, a range stays a
    # range (Q7), from the validated bounds rather than the raw client text.
    normalized = str(floor) if floor == ceiling else f"{floor}-{ceiling}"

    result = sessions.pin_prescription(session_id, clerk_user_id, position, normalized)
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return result


def clear_pin(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
) -> SessionView:
    """Un-pin the prescription at ``position`` in the owner's Session — Pin's inverse.

    Same guards as ``pin_prescription`` (ownership, prescription present, un-performed);
    clears the pinned marker so automatic Progression resumes from the latest logs with no
    lingering effect and no recomputation of history. Idempotent on an already-unpinned
    prescription. (Un-pin is not gated on the bodyweight check — clearing a marker is
    always safe.)
    """

    _guard_owned_unperformed(
        session_id, clerk_user_id, position, sessions=sessions, logged=logged
    )

    result = sessions.clear_pin(session_id, clerk_user_id, position)
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return result


__all__ = [
    "SessionNotFound",
    "PrescriptionNotFound",
    "SessionAlreadyPerformed",
    "InvalidPinTarget",
    "PinTargetNotBodyweight",
    "pin_prescription",
    "clear_pin",
]
