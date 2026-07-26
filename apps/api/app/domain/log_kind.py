"""The log-kind boundary rule (ADR-0031): resolve a Logged Session's training type
and enforce the plan-backed / plan-less mutual exclusion.

A record is *plan-backed* when it names a Session (``session_id`` present) and
*plan-less* when it does not. The two shapes are mutually exclusive by construction:

- **plan-backed** ⇒ training type is *copied from the Session*; any training type on
  the request is ignored, and a Completion Outcome may gate the Protocol.
- **plan-less** ⇒ training type is *required* and rides on the record; a Completion
  Outcome is *forbidden* — an ad-hoc record gates no Protocol and has no outcome to
  declare. (No Session id can reach this rule for a plan-less record: its absence is
  what makes the record plan-less.)

Pure — no I/O, no ORM. The service looks up the Session for ownership and hands its
training type in; this rule decides which one wins and rejects an ill-formed request.
"""

from __future__ import annotations


class LogKindError(ValueError):
    """A logging request violates the plan-backed / plan-less boundary rule."""


def resolve_training_type(
    *,
    session_id: int | None,
    request_training_type: str | None,
    completion_outcome: str | None,
    session_training_type: str | None,
) -> str:
    """Return the training type to store on the record, or raise ``LogKindError``.

    ``session_training_type`` is the prescribing Session's training type (already
    looked up by the caller) and is authoritative for a plan-backed record. For a
    plan-less record it is unused and the request's own ``request_training_type`` is
    required and rides onto the record.
    """

    if session_id is not None:
        # Plan-backed: the Session's training type wins; the request's is ignored.
        if session_training_type is None:
            raise LogKindError(
                "A plan-backed log must resolve its training type from the Session."
            )
        return session_training_type

    # Plan-less: no Session to gate a Protocol and no Completion Outcome to declare.
    if completion_outcome is not None:
        raise LogKindError("A plan-less log cannot declare a completion outcome.")
    if request_training_type is None or not request_training_type.strip():
        raise LogKindError("A plan-less log must carry a training type.")
    return request_training_type.strip()


__all__ = ["LogKindError", "resolve_training_type"]
