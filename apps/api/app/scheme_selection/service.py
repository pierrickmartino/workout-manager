"""Selecting a Progression Scheme in place, the standalone-Session write path (ADR-0064).

Choosing a movement's Progression Scheme is a **no-AI plan edit**. For a standalone
Session it happens *in place* — the same posture as Insert / Remove / Substitution
(ADR-0051/0052) — while a Protocol-member Prescription is edited through the Builder's
tail-gated Deploy path instead (ADR-0020), so this service refuses one, directing the
user to the Builder rather than rewriting a Session inside an ordered sequence.

``set_scheme`` writes a chosen scheme onto the owner's own copy after checking the choice
is **compatible** with the movement's Load kind — a weight-axis scheme like Greyskull on a
pure-bodyweight (or Load-less) movement has nothing to step and is rejected outright
(load-kind honesty), never silently downgraded. ``clear_scheme`` is its inverse: it drops
the selection back to ``None`` so the movement resumes the default (Double Progression) —
a clean, non-destructive restore that recomputes no history. Neither ever touches a Logged
Session: switching or clearing a scheme changes only how the *un-performed* tail projects.

Typed errors the route maps to the standard error envelope: a missing/unowned Session or
absent position to ``404``, a Protocol member to ``409``, and an incompatible choice to
``422``.
"""

from __future__ import annotations

from app.domain.load import ParsedLoad
from app.domain.progression import (
    ProgressionScheme,
    scheme_applies_to_optional_load,
)
from app.repositories.session_repository import (
    PrescriptionView,
    SessionRepository,
    SessionView,
)


class SessionNotFound(Exception):
    """The Session does not exist or is owned by another user."""


class PrescriptionNotFound(Exception):
    """The Session has no Exercise Prescription at the requested position."""


class SchemeNotOnProtocolMember(Exception):
    """The Session is a Protocol member. Choosing a scheme there is a Builder edit
    committed through Deploy (ADR-0020), so the in-place path refuses it — a Session in
    an ordered sequence is never rewritten outside the tail-gated Deploy write."""


class IncompatibleScheme(Exception):
    """The chosen scheme does not apply to the movement's Load kind (ADR-0064).

    A weight-axis scheme (Greyskull) on a pure-bodyweight, %-1RM, range, qualitative or
    Load-less movement has nothing to step; selecting it is rejected rather than silently
    falling back to the default, so a movement never behaves unlike its chosen label."""

    def __init__(self, scheme: ProgressionScheme) -> None:
        self.scheme = scheme
        super().__init__(f"The {scheme.value} scheme does not apply to this movement.")


def _find_prescription(view: SessionView, position: int) -> PrescriptionView | None:
    for prescription in view.prescriptions:
        if prescription.position == position:
            return prescription
    return None


def _guard_standalone_prescription(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    sessions: SessionRepository,
) -> PrescriptionView:
    """The guards shared by set and clear: the user owns the Session
    (``SessionNotFound``), it is standalone (``SchemeNotOnProtocolMember``), and it has a
    Prescription at ``position`` (``PrescriptionNotFound``). Returns that Prescription."""

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    # Standalone-only: a Protocol member's scheme is chosen on the Builder and committed
    # via Deploy (ADR-0020), mirroring Insert / Remove.
    if view.is_protocol_member:
        raise SchemeNotOnProtocolMember(session_id)

    prescription = _find_prescription(view, position)
    if prescription is None:
        raise PrescriptionNotFound(position)

    return prescription


def set_scheme(
    session_id: int,
    clerk_user_id: str,
    position: int,
    scheme: ProgressionScheme,
    *,
    sessions: SessionRepository,
) -> SessionView:
    """Choose ``scheme`` for the prescription at ``position`` in the owner's standalone
    Session.

    Validates the whole request before any write: the user owns the Session
    (``SessionNotFound``), it is standalone (``SchemeNotOnProtocolMember``), it has a
    prescription at ``position`` (``PrescriptionNotFound``), and the chosen scheme is
    compatible with the movement's Load (``IncompatibleScheme``). On success the selection
    is stored on the user's own copy — the read-time overlay then progresses that movement
    by the chosen scheme — and the updated Session is returned. No Logged Session and
    nothing else on the plan is touched.
    """

    prescription = _guard_standalone_prescription(
        session_id, clerk_user_id, position, sessions=sessions
    )

    load = (
        ParsedLoad.from_dict(prescription.recommended_load)
        if prescription.recommended_load is not None
        else None
    )
    if not scheme_applies_to_optional_load(scheme, load):
        raise IncompatibleScheme(scheme)

    result = sessions.set_scheme(session_id, clerk_user_id, position, scheme.value)
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return result


def clear_scheme(
    session_id: int,
    clerk_user_id: str,
    position: int,
    *,
    sessions: SessionRepository,
) -> SessionView:
    """Clear the Progression Scheme selection from the prescription at ``position`` — the
    inverse of :func:`set_scheme`.

    Same ownership / standalone / prescription guards as ``set_scheme`` (no compatibility
    check — clearing is always legal, the default applies to every Load). Drops the
    selection to ``None`` so the movement resumes the default (Double Progression) with no
    recomputation of history; idempotent on an already-default prescription. Returns the
    updated Session.
    """

    _guard_standalone_prescription(
        session_id, clerk_user_id, position, sessions=sessions
    )

    result = sessions.set_scheme(session_id, clerk_user_id, position, None)
    if result is None:  # ownership/position checked above; defensive only
        raise SessionNotFound(session_id)
    return result


__all__ = [
    "SessionNotFound",
    "PrescriptionNotFound",
    "SchemeNotOnProtocolMember",
    "IncompatibleScheme",
    "set_scheme",
    "clear_scheme",
]
