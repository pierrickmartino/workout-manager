"""Delete: hard-delete an un-started Protocol and its plan-side dependents (#639, ADR-0125).

Only a Protocol nobody has trained may go: one with **no Logged Session of any Completion
Outcome** against any member Session. A performed plan is settled record (ADR-0020), and
an Incomplete log is still logged training, so either refuses the delete.

The un-started guard is authoritative and runs here, inside the delete, rather than
trusting the ``deletable`` the index served: a Session logged after the client drew the
list turns the delete into a ``STARTED`` refusal, never a lost record. A Logged Session
committed concurrently, after this guard's read, still pins its Session row through the
foreign key, so the repository rolls the cascade back whole and raises ``ProtocolStarted``,
which is the same ``STARTED`` refusal.

Cascade order is children-first, mirroring Session Delete (ADR-0063): each member
Session's Generation Feedback is flushed through its own repository, then the Protocol
repository removes the Prescriptions, the member Sessions and the Protocol row (with its
Calibration) and issues the single terminal commit."""

from __future__ import annotations

from enum import Enum

from app.domain.protocol_deletion import is_started, logged_session_ids
from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.protocol_repository import ProtocolRepository, ProtocolStarted


class DeleteStatus(str, Enum):
    """The outcome of a Delete call."""

    DELETED = "deleted"
    NOT_FOUND = "not_found"
    STARTED = "started"


def delete_protocol(
    clerk_user_id: str,
    protocol_id: int,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
    feedback: GenerationFeedbackRepository,
) -> DeleteStatus:
    """Delete the owner's un-started Protocol.

    ``NOT_FOUND`` when the Protocol is missing or another user's, ``STARTED`` when any
    Logged Session references a member Session — in both cases before a single row is
    removed."""

    protocol = protocols.get(protocol_id, clerk_user_id)
    if protocol is None:
        return DeleteStatus.NOT_FOUND
    history = logged.list_for_user(clerk_user_id)
    logged_ids = logged_session_ids(entry.session_id for entry in history)
    if is_started((session.session_id for session in protocol.sessions), logged_ids):
        return DeleteStatus.STARTED

    for session in protocol.sessions:
        feedback.delete_for_session(session.session_id)
    try:
        deleted = protocols.delete(protocol_id, clerk_user_id)
    except ProtocolStarted:  # a log committed after the guard read
        return DeleteStatus.STARTED
    if not deleted:  # removed since the read
        return DeleteStatus.NOT_FOUND
    return DeleteStatus.DELETED


__all__ = ["DeleteStatus", "delete_protocol"]
