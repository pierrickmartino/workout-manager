"""Behavior of the consistent API response envelope."""

from __future__ import annotations

from app.envelope import error_envelope, success_envelope


def test_success_envelope_carries_data_and_no_error():
    # Act
    body = success_envelope({"id": 1})

    # Assert
    assert body == {"success": True, "data": {"id": 1}, "error": None}


def test_success_envelope_includes_meta_when_provided():
    # Act
    body = success_envelope([1, 2], meta={"total": 2, "page": 1})

    # Assert
    assert body["success"] is True
    assert body["data"] == [1, 2]
    assert body["meta"] == {"total": 2, "page": 1}


def test_error_envelope_carries_message_and_null_data():
    # Act
    body = error_envelope("not found")

    # Assert
    assert body == {"success": False, "data": None, "error": "not found"}
