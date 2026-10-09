"""Switch: make a set-aside Protocol the Current Protocol again (#638, ADR-0125).

Switch is a plan-side *choice*, like Favorite: it stamps the Protocol's
``made_current_at`` and nothing else, so no Session, Prescription or Logged Session is
written and every record projection (XP, Streak, Personal Records, History) is unchanged.
The previous Current Protocol is set aside by the selection rule, not by a write.

Layered like ``calibration``: the service resolves ownership, reads the Logged history
once, refuses a Finished Protocol (it has no Next Session to drive Home), writes, and
returns the progressed view of the new Current Protocol over that same history."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.protocols.progress import ProtocolProgressView, progressed_protocol_from
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.protocol_repository import ProtocolRepository


class SwitchStatus(str, Enum):
    """The outcome of a Switch call."""

    SWITCHED = "switched"
    NOT_FOUND = "not_found"
    FINISHED = "finished"


@dataclass(frozen=True)
class SwitchResult:
    status: SwitchStatus
    protocol: ProtocolProgressView | None = None


def switch_protocol(
    clerk_user_id: str,
    protocol_id: int,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
) -> SwitchResult:
    """Make the owner's unfinished Protocol Current.

    ``NOT_FOUND`` when the Protocol is missing or another user's, ``FINISHED`` when every
    Session is performed. Switching to the Protocol that is already Current re-stamps it,
    which leaves it Current: harmless by construction."""

    protocol = protocols.get(protocol_id, clerk_user_id)
    if protocol is None:
        return SwitchResult(SwitchStatus.NOT_FOUND)
    history = logged.list_for_user(clerk_user_id)
    if progressed_protocol_from(protocol, history).next_session is None:
        return SwitchResult(SwitchStatus.FINISHED)

    switched = protocols.make_current(protocol_id, clerk_user_id)
    if switched is None:  # removed between the read and the write
        return SwitchResult(SwitchStatus.NOT_FOUND)
    return SwitchResult(
        SwitchStatus.SWITCHED, progressed_protocol_from(switched, history)
    )


__all__ = ["SwitchResult", "SwitchStatus", "switch_protocol"]
