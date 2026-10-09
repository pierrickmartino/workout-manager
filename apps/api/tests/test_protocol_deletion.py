"""The started rule that gates a Protocol's Delete (ADR-0125), as a pure function."""

from __future__ import annotations

from app.domain.protocol_deletion import is_started, logged_session_ids


def test_a_protocol_with_no_logged_member_session_is_not_started():
    # Arrange
    logged = logged_session_ids([7, None, 9])

    # Act
    started = is_started([1, 2, 3], logged)

    # Assert
    assert started is False


def test_one_logged_member_session_starts_the_protocol():
    # Arrange
    logged = logged_session_ids([2])

    # Act
    started = is_started([1, 2, 3], logged)

    # Assert
    assert started is True


def test_plan_less_records_are_dropped_from_the_logged_ids():
    # Act
    logged = logged_session_ids([None, 4, None])

    # Assert
    assert logged == frozenset({4})
