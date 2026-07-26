"""The log-kind boundary rule (ADR-0031): which training type a record carries and
the plan-backed / plan-less mutual exclusion, tested as a pure function.

A record is *plan-backed* when it names a Session and *plan-less* when it does not.
``resolve_training_type`` decides which training type wins and rejects an ill-formed
plan-less request — no I/O, so the whole rule is exercised here without a database."""

from __future__ import annotations

import pytest

from app.domain.log_kind import LogKindError, resolve_training_type


def test_plan_backed_copies_the_training_type_from_the_session():
    # Arrange / Act — a record naming a Session inherits that Session's training type
    resolved = resolve_training_type(
        session_id=7,
        request_training_type=None,
        completion_outcome=None,
        session_training_type="strength",
    )

    # Assert
    assert resolved == "strength"


def test_plan_backed_ignores_a_training_type_on_the_request():
    # Arrange / Act — the Session is authoritative; a request's training type is dropped
    resolved = resolve_training_type(
        session_id=7,
        request_training_type="cardio",
        completion_outcome="completed",
        session_training_type="strength",
    )

    # Assert — the Session's type wins, not the request's
    assert resolved == "strength"


def test_plan_less_carries_its_own_training_type():
    # Arrange / Act — no Session, so the request's training type rides on the record
    resolved = resolve_training_type(
        session_id=None,
        request_training_type="cardio",
        completion_outcome=None,
        session_training_type=None,
    )

    # Assert
    assert resolved == "cardio"


def test_plan_less_requires_a_training_type():
    # Act / Assert — a plan-less record with no training type is a boundary violation
    with pytest.raises(LogKindError):
        resolve_training_type(
            session_id=None,
            request_training_type=None,
            completion_outcome=None,
            session_training_type=None,
        )


def test_plan_less_rejects_a_blank_training_type():
    # Act / Assert — whitespace is not a training type
    with pytest.raises(LogKindError):
        resolve_training_type(
            session_id=None,
            request_training_type="   ",
            completion_outcome=None,
            session_training_type=None,
        )


def test_plan_less_forbids_a_completion_outcome():
    # Act / Assert — an ad-hoc record gates no Protocol, so it declares no outcome
    with pytest.raises(LogKindError):
        resolve_training_type(
            session_id=None,
            request_training_type="cardio",
            completion_outcome="completed",
            session_training_type=None,
        )
