"""The Delete service: guarded, cascading removal of a standalone Session (ADR-0063).

Deleting a Session spans several repositories — it must read the plan, check the *record*
for any performance, and clean up the plan's dependents — so the orchestration lives here
rather than in a route or a single repository, mirroring the other multi-repository
services (``authoring``, ``pinning``, ``substitution``).

The two load-bearing guards live at the top, before any write:

- **No Logged Session** — a performed Session is settled record and is never deleted
  (plan/record separation, ADR-0001/0020). The guard reads the **Logged Count**; a race
  where a performance lands after the client drew the list is caught here, so a delete can
  never destroy a record.
- **Standalone only** — a Protocol-member Session is never deleted here (its removal is the
  Builder's tail-gated Deploy), exactly as Rename / Favorite / Share / Insert / Remove.

Cascade order is children-first (Generation Feedback and Share Links through their own
repositories, then the Session with its Prescriptions and Favorite marker through the
Session repository) so a foreign-key-enforcing database accepts the parent delete. The
cascade is **atomic**: the child cleanups only *flush*, and the terminal Session delete
issues the one *commit* — all repositories in a request share a single database session, so
the whole cascade lands together or, on any failure before that commit, rolls back whole.
"""

from __future__ import annotations

from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.share_link_repository import ShareLinkRepository


class SessionNotFound(Exception):
    """The Session is missing or owned by another user — a non-owner never deletes."""


class SessionNotStandalone(Exception):
    """The Session belongs to a Protocol; Delete is offered on standalone Sessions only."""


class SessionHasLoggedSessions(Exception):
    """The Session has been performed; a performed plan is settled record and is not deleted."""


def delete_session(
    session_id: int,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
    shares: ShareLinkRepository,
    feedback: GenerationFeedbackRepository,
) -> None:
    """Delete the owner's standalone Session and its plan-side dependents (ADR-0063).

    Raises :class:`SessionNotFound` when the Session is missing or not the caller's,
    :class:`SessionNotStandalone` on a Protocol member, and
    :class:`SessionHasLoggedSessions` when any Logged Session references it — in every case
    before a single row is removed, so a refused delete leaves the plan and its record
    untouched.
    """

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound
    if view.is_protocol_member:
        raise SessionNotStandalone
    if logged.count_for_session(clerk_user_id, session_id) > 0:
        raise SessionHasLoggedSessions

    # Children first so the FK-enforcing database accepts the Session delete. The child
    # cleanups flush without committing; ``sessions.delete`` issues the single terminal commit
    # that finalizes the whole cascade atomically (it also removes the Session's own
    # Prescriptions and Favorite marker). All three repositories share one request session.
    shares.delete_for_session(session_id)
    feedback.delete_for_session(session_id)
    deleted = sessions.delete(session_id, clerk_user_id)
    if not deleted:
        # The owner's Session vanished between the guard read and the delete — treat it as
        # already gone rather than reporting a false success.
        raise SessionNotFound


__all__ = [
    "SessionNotFound",
    "SessionNotStandalone",
    "SessionHasLoggedSessions",
    "delete_session",
]
