"""The contiguity gate (ADR-0034): decide whether a Log Correction keeps the performed
sequence gap-free.

Protocol advancement is a read-time projection (ADR-0013/0030): the performed set is
the set of Session ids with an advancing Logged Session, and the Next Session is the
first position not in it. Deleting a mid-Protocol performance — or flipping it to
Incomplete — removes its Session from that set, punching a *hole*.
Advancement self-heals (the Session simply becomes Next again), but ``reenumerate_tail``
(ADR-0020) assumes the performed Sessions are a **contiguous prefix** it passes through
untouched; a later DEPLOY over a holed set would place a performed Session at a new
position, reordering settled record. So rather than teach the Builder to fold around a
hole, Log Correction refuses the operations that create one.

The rule, in one line: a correction is refused **iff it would remove the target's
Session from the performed set *and* a later-positioned Session in the same Protocol is
currently performed** ("undo those first" — tail-first correction). Every purely-data
correction is allowed; the fill direction (Incomplete→Completed) only adds to the set,
so it is always allowed; and so is any delete or un-complete of a plan-less, standalone,
or last-performed record — none can leave a gap.

Pure — no I/O, no ORM, mirroring the pure projection tier of ``app/protocols/progress.py``.
The service reads the history once and hands it in, together with the parent Protocol's
Session ordering; this module only decides. It reads three fields off each log through a
structural ``PerformedLog`` protocol, so it stays decoupled from the repository view.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Protocol, Sequence

from app.domain.completion import CompletionOutcome


class CorrectionOperation(Enum):
    """The kind of Log Correction being attempted, which decides whether it *can*
    remove the target's Session from the performed set.

    ``DATA_ONLY`` — fixing sets, load, reps, date, or duration; never removes a Session,
    so it is always permitted. ``DELETE`` — removes the record, so it removes the
    Session when no other advancing performance of it remains. ``FLIP_TO_INCOMPLETE`` —
    the target keeps its place in history but stops advancing, removing its Session the
    same way a delete does. ``FLIP_TO_COMPLETED`` — the reverse: the target starts
    advancing, which only *fills* the performed set and can never open a hole."""

    DATA_ONLY = "data_only"
    DELETE = "delete"
    FLIP_TO_INCOMPLETE = "flip_to_incomplete"
    FLIP_TO_COMPLETED = "flip_to_completed"


class PerformedLog(Protocol):
    """The minimal read shape the gate needs off a Logged Session: its identity, the
    Session it performed (``None`` for a plan-less record), and its Completion Outcome.
    """

    id: int
    session_id: int | None
    completion_outcome: str | None


@dataclass(frozen=True)
class ContiguityVerdict:
    """The gate's decision: ``allowed`` with a tail-first ``reason`` when refused."""

    allowed: bool
    reason: str | None = None


# The tail-first refusal, worded for the operation that would open the hole. Both point
# the user at the same fix: settle the later Sessions first.
_DELETE_TAIL_FIRST_REASON = (
    "Undo the later sessions you performed in this protocol first — deleting this one "
    "would leave a gap in your performed sequence."
)
_FLIP_TAIL_FIRST_REASON = (
    "Undo the later sessions you performed in this protocol first — un-completing this "
    "one would leave a gap in your performed sequence."
)

_TAIL_FIRST_REASONS = {
    CorrectionOperation.DELETE: _DELETE_TAIL_FIRST_REASON,
    CorrectionOperation.FLIP_TO_INCOMPLETE: _FLIP_TAIL_FIRST_REASON,
}


def _advances(log: PerformedLog) -> bool:
    """Whether a log advances its Protocol (ADR-0013): any outcome but Incomplete.

    An undeclared outcome (``None``) still advances — it keeps ADR-0001's original
    "any log advances" rule — matching ``progress._advances`` exactly."""

    return log.completion_outcome != CompletionOutcome.INCOMPLETE.value


def _performed_sessions(history: Sequence[PerformedLog]) -> set[int]:
    """The set of Session ids with at least one advancing Logged Session."""

    return {
        log.session_id
        for log in history
        if log.session_id is not None and _advances(log)
    }


def _performed_after(
    history: Sequence[PerformedLog],
    target: PerformedLog,
    operation: CorrectionOperation,
) -> set[int]:
    """The performed set once ``operation`` is applied to ``target``, without mutating
    anything.

    A ``DELETE`` drops the target from the history it is computed over. A flip keeps the
    target in place but overrides whether it advances — ``FLIP_TO_COMPLETED`` makes it
    advance, ``FLIP_TO_INCOMPLETE`` makes it stop — so the same read model that projects
    the Next Session decides the post-correction performed set."""

    if operation is CorrectionOperation.DELETE:
        return _performed_sessions([log for log in history if log.id != target.id])

    target_advances_after = operation is CorrectionOperation.FLIP_TO_COMPLETED
    performed: set[int] = set()
    for log in history:
        advances = target_advances_after if log.id == target.id else _advances(log)
        if log.session_id is not None and advances:
            performed.add(log.session_id)
    return performed


def evaluate_contiguity(
    *,
    target: PerformedLog,
    operation: CorrectionOperation,
    history: Sequence[PerformedLog],
    protocol_session_order: Sequence[int],
) -> ContiguityVerdict:
    """Return whether ``operation`` on ``target`` keeps the performed sequence gap-free.

    ``history`` is the user's full Logged history (including ``target``);
    ``protocol_session_order`` is the parent Protocol's Session ids in position order,
    or empty when the target is plan-less or a standalone Session that belongs to no
    Protocol. Both are already loaded — the gate does no I/O.
    """

    if operation is CorrectionOperation.DATA_ONLY:
        return ContiguityVerdict(allowed=True)

    # A plan-less record gates no Protocol, so it can never leave a gap.
    if target.session_id is None:
        return ContiguityVerdict(allowed=True)

    performed_before = _performed_sessions(history)
    performed_after = _performed_after(history, target, operation)

    # No hole unless the operation actually removes the target's Session from the
    # performed set. It stays put for the fill direction (FLIP_TO_COMPLETED only adds),
    # when the target never contributed (an already-Incomplete log was never in the set),
    # or when another advancing log keeps the Session performed.
    removes_session = (
        target.session_id in performed_before
        and target.session_id not in performed_after
    )
    if not removes_session:
        return ContiguityVerdict(allowed=True)

    # A standalone Session (in no Protocol) has no later position to un-settle.
    if target.session_id not in protocol_session_order:
        return ContiguityVerdict(allowed=True)

    target_position = protocol_session_order.index(target.session_id)
    later_performed = any(
        session_id in performed_after
        for session_id in protocol_session_order[target_position + 1 :]
    )
    if later_performed:
        return ContiguityVerdict(
            allowed=False, reason=_TAIL_FIRST_REASONS[operation]
        )
    return ContiguityVerdict(allowed=True)


__all__ = [
    "CorrectionOperation",
    "PerformedLog",
    "ContiguityVerdict",
    "evaluate_contiguity",
]
