"""Behavior of the contiguity gate (ADR-0034): the pure decision at the heart of Log
Correction that keeps the performed sequence gap-free.

The gate is a pure function over already-loaded data — the target Logged Session, the
operation kind, the user's Logged history, and the parent Protocol's Session ordering.
Its rule: a correction is refused **iff it would remove the target's Session from the
performed set (a delete, or — later — an outcome→Incomplete flip) *and* a
later-positioned Session in the same Protocol is currently performed**. Every other
correction is permitted. This slice implements and tests the **delete** branch.

Tested by hand-passing lightweight log records and a Protocol Session ordering, with no
repository — mirroring the pure-projection unit tests around ``app/protocols/progress.py``.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.contiguity import (
    CorrectionOperation,
    evaluate_contiguity,
)


@dataclass(frozen=True)
class _Log:
    """The minimal shape the gate reads off a Logged Session (structural typing)."""

    id: int
    session_id: int | None
    completion_outcome: str | None = "completed"


def test_delete_of_a_mid_protocol_session_with_a_later_performed_session_is_refused():
    # Arrange — a Protocol of three Sessions; the user performed the first two, so the
    # performed set is the contiguous prefix {10, 11}. The target is the mid-Protocol
    # Session 10.
    order = [10, 11, 12]
    target = _Log(id=1, session_id=10)
    history = [target, _Log(id=2, session_id=11)]

    # Act — try to delete the mid-Protocol performance
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=order,
    )

    # Assert — refused: deleting it would leave a hole a later DEPLOY could reorder
    assert verdict.allowed is False
    assert verdict.reason is not None


def test_delete_of_a_mid_protocol_session_with_no_later_performed_session_is_allowed():
    # Arrange — only Session 10 is performed; 11 and 12 are still un-performed
    order = [10, 11, 12]
    target = _Log(id=1, session_id=10)
    history = [target]

    # Act
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=order,
    )

    # Assert — allowed: no later Session is performed, so no hole opens
    assert verdict.allowed is True


def test_delete_of_the_last_performed_session_is_allowed():
    # Arrange — the whole prefix {10, 11, 12} is performed; the target is the last one
    order = [10, 11, 12]
    target = _Log(id=3, session_id=12)
    history = [_Log(id=1, session_id=10), _Log(id=2, session_id=11), target]

    # Act — redo the Session you just botched: delete the most recent performance
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=order,
    )

    # Assert — allowed: removing the tail keeps the prefix contiguous
    assert verdict.allowed is True


def test_delete_of_a_plan_less_record_is_always_allowed():
    # Arrange — a standalone ad-hoc record (session_id is None), never gates a Protocol
    target = _Log(id=1, session_id=None, completion_outcome=None)
    history = [target]

    # Act
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=[],
    )

    # Assert
    assert verdict.allowed is True


def test_delete_of_a_standalone_session_not_in_any_protocol_is_allowed():
    # Arrange — a plan-backed record whose Session belongs to no Protocol (a standalone
    # generated Session): the ordering it is measured against is empty
    target = _Log(id=1, session_id=99)
    history = [target]

    # Act
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=[],
    )

    # Assert — no Protocol position, so no later Session can be un-settled
    assert verdict.allowed is True


def test_delete_is_allowed_when_the_session_stays_performed_by_another_log():
    # Arrange — Session 10 was performed twice; a later Session 11 is also performed.
    # Deleting one of the two logs of Session 10 leaves it performed, so no hole opens.
    order = [10, 11]
    target = _Log(id=1, session_id=10)
    history = [
        target,
        _Log(id=2, session_id=10),
        _Log(id=3, session_id=11),
    ]

    # Act
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=order,
    )

    # Assert — the Session is still performed by its other log; nothing is removed
    assert verdict.allowed is True


def test_delete_of_an_incomplete_mid_protocol_log_is_allowed():
    # Arrange — the target log is Incomplete, so it was never in the performed set; a
    # later Session is performed, but deleting a non-advancing log removes nothing.
    order = [10, 11]
    target = _Log(id=1, session_id=10, completion_outcome="incomplete")
    history = [target, _Log(id=2, session_id=11)]

    # Act
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DELETE,
        history=history,
        protocol_session_order=order,
    )

    # Assert — no hole: an Incomplete log never contributed to the performed prefix
    assert verdict.allowed is True


def test_data_only_correction_is_always_allowed_even_mid_protocol():
    # Arrange — the everyday "I entered 60 kg, meant 70 kg" on a mid-Protocol Session
    # whose later Sessions are performed. A data fix removes no Session (user story 22).
    order = [10, 11, 12]
    target = _Log(id=1, session_id=10)
    history = [target, _Log(id=2, session_id=11)]

    # Act
    verdict = evaluate_contiguity(
        target=target,
        operation=CorrectionOperation.DATA_ONLY,
        history=history,
        protocol_session_order=order,
    )

    # Assert — never gated: fixing a number is not a hole-creating operation
    assert verdict.allowed is True
