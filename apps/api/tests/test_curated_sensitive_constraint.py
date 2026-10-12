"""Curated Protocols for a user with a Sensitive Constraint (issue #687, ADR-0130, ADR-0058).

A Curated Protocol is shared content tailored to no one, so it takes the Redeem posture: the
list tells the client the caveat applies, and adopting persists the copy **set aside**, never
Current, until the user Switches to it (ADR-0125). A user without a Sensitive Constraint is
unaffected. Driven end to end over HTTP through the shared Curated Protocol harness."""

from __future__ import annotations

from tests.test_curated_protocols_endpoint import USER, build_harness


def _make_sensitive(h, sub: str = USER) -> None:
    response = h.client.put(
        "/api/profile",
        json={"sensitive_constraints": ["injury"]},
        headers=h.auth(sub),
    )
    assert response.status_code == 200


def _current_id(h, sub: str = USER) -> int | None:
    current = h.get("/api/home", sub).json()["data"]["current_protocol"]
    return current["id"] if current else None


def _statuses(h, sub: str = USER) -> dict[int, str]:
    return {row["id"]: row["status"] for row in h.get("/api/protocols", sub).json()["data"]}


# --- List -------------------------------------------------------------------------------


def test_the_list_marks_the_caveat_as_applicable_for_a_sensitive_constraint_user():
    # Arrange
    h = build_harness()
    _make_sensitive(h)

    # Act
    rows = h.list().json()["data"]

    # Assert
    assert rows
    assert all(row["sensitive_constraint_caveat"] is True for row in rows)


def test_the_list_does_not_mark_the_caveat_for_a_user_without_one():
    # Arrange
    h = build_harness()

    # Act
    rows = h.list().json()["data"]

    # Assert
    assert rows
    assert all(row["sensitive_constraint_caveat"] is False for row in rows)


# --- Adopt ------------------------------------------------------------------------------


def test_a_sensitive_constraint_user_adopts_set_aside_and_keeps_their_current_protocol():
    # Arrange
    h = build_harness()
    previous = h.adopt().json()["data"]["protocol_id"]
    _make_sensitive(h)

    # Act
    response = h.adopt()

    # Assert
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["set_aside"] is True
    adopted = data["protocol_id"]
    assert _current_id(h) == previous
    assert _statuses(h) == {previous: "current", adopted: "set_aside"}


def test_a_set_aside_adopt_is_never_current_even_with_no_other_protocol():
    # Arrange
    h = build_harness()
    _make_sensitive(h)

    # Act
    adopted = h.adopt().json()["data"]["protocol_id"]

    # Assert
    assert _current_id(h) is None
    assert _statuses(h) == {adopted: "set_aside"}


# --- Switch -----------------------------------------------------------------------------


def test_switching_to_the_set_aside_adopt_makes_it_current():
    # Arrange
    h = build_harness()
    previous = h.adopt().json()["data"]["protocol_id"]
    _make_sensitive(h)
    adopted = h.adopt().json()["data"]["protocol_id"]

    # Act
    response = h.client.post(f"/api/protocols/{adopted}/switch", headers=h.auth())

    # Assert
    assert response.status_code == 200
    assert _current_id(h) == adopted
    assert _statuses(h) == {adopted: "current", previous: "set_aside"}


# --- Without a Sensitive Constraint ------------------------------------------------------


def test_a_user_without_a_sensitive_constraint_adopts_it_as_current():
    # Arrange
    h = build_harness()
    previous = h.adopt().json()["data"]["protocol_id"]

    # Act
    data = h.adopt().json()["data"]

    # Assert
    assert data["set_aside"] is False
    assert _current_id(h) == data["protocol_id"]
    assert _statuses(h) == {data["protocol_id"]: "current", previous: "set_aside"}
