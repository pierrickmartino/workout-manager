"""The Builder can set a Session's Training Type and duration (#707, ADR-0020 amendment).

A deploy's ``DraftSession`` may carry its own ``training_type`` and ``duration_minutes``. A
value sent wins; an omitted one means an existing Session keeps its own and a fresh slot
takes the Protocol's. Both are validated at the request boundary — a closed Training Type
set and the generation duration bounds — so a bad value is a 422 that persists nothing.
The progress view exposes both per Session, so the Builder shows what it will deploy."""

from __future__ import annotations

from tests.test_deploy_endpoint import _deploy_body, _fresh_protocol
from tests.test_protocol_endpoint import (
    FakeProtocolGenerator,
    _kg_protocol,
    build_harness,
)

SUB = "user_session_type"


def _harness_and_protocol():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    return h, _fresh_protocol(h, SUB)


def _new_slot(protocol: dict, **fields) -> dict:
    exercise_id = protocol["sessions"][0]["prescriptions"][0]["exercise_id"]
    return {
        "session_id": None,
        "week": protocol["weeks"] + 1,
        "day": 1,
        "prescriptions": [
            {"exercise_id": exercise_id, "sets": 1, "reps": "30 min", "load_kind": "absolute"}
        ],
        **fields,
    }


def _deploy(h, protocol: dict, body: dict):
    return h.client.post(
        f"/api/protocols/{protocol['id']}/deploy", headers=h.auth(SUB), json=body
    )


def _types(h, protocol: dict) -> list[tuple[str, int]]:
    after = h.fetch_protocol(SUB, protocol["id"]).json()["data"]
    return [(s["training_type"], s["duration_minutes"]) for s in after["sessions"]]


def test_the_progress_view_exposes_each_sessions_training_type_and_duration():
    # Arrange
    h, protocol = _harness_and_protocol()

    # Act
    sessions = protocol["sessions"]

    # Assert — a generated Session carries its Protocol's values, read per Session.
    assert [(s["training_type"], s["duration_minutes"]) for s in sessions] == [
        (protocol["training_type"], protocol["duration_minutes"])
    ] * len(sessions)


def test_a_new_slot_deployed_with_a_training_type_and_duration_keeps_them():
    # Arrange
    h, protocol = _harness_and_protocol()
    body = _deploy_body(protocol, weeks=protocol["weeks"] + 1)
    body["sessions"].append(_new_slot(protocol, training_type="cardio", duration_minutes=35))

    # Act
    response = _deploy(h, protocol, body)

    # Assert
    assert response.status_code == 200
    assert _types(h, protocol)[-1] == ("cardio", 35)


def test_a_new_slot_deployed_without_them_takes_the_protocols():
    # Arrange
    h, protocol = _harness_and_protocol()
    body = _deploy_body(protocol, weeks=protocol["weeks"] + 1)
    body["sessions"].append(_new_slot(protocol))

    # Act
    response = _deploy(h, protocol, body)

    # Assert
    assert response.status_code == 200
    assert _types(h, protocol)[-1] == (protocol["training_type"], protocol["duration_minutes"])


def test_an_existing_session_can_be_retyped_and_given_its_own_duration():
    # Arrange
    h, protocol = _harness_and_protocol()
    body = _deploy_body(protocol)
    body["sessions"][0] = {**body["sessions"][0], "training_type": "mobility", "duration_minutes": 20}

    # Act
    response = _deploy(h, protocol, body)

    # Assert — only the edited Session changes.
    assert response.status_code == 200
    fallback = (protocol["training_type"], protocol["duration_minutes"])
    assert _types(h, protocol) == [("mobility", 20)] + [fallback] * (len(body["sessions"]) - 1)


def test_an_existing_session_deployed_without_them_keeps_its_own():
    # Arrange — retype the first Session, then re-deploy the tail with the fields omitted.
    h, protocol = _harness_and_protocol()
    retyped = _deploy_body(protocol)
    retyped["sessions"][0] = {**retyped["sessions"][0], "training_type": "yoga", "duration_minutes": 45}
    assert _deploy(h, protocol, retyped).status_code == 200
    redeployed = h.fetch_protocol(SUB, protocol["id"]).json()["data"]

    # Act
    response = _deploy(h, protocol, _deploy_body(redeployed))

    # Assert
    assert response.status_code == 200
    assert _types(h, protocol)[0] == ("yoga", 45)


def test_an_unknown_training_type_is_rejected_and_persists_nothing():
    # Arrange
    h, protocol = _harness_and_protocol()
    before = _types(h, protocol)
    body = _deploy_body(protocol)
    body["sessions"][0] = {**body["sessions"][0], "training_type": "running"}

    # Act
    response = _deploy(h, protocol, body)

    # Assert
    assert response.status_code == 422
    assert _types(h, protocol) == before


def test_a_duration_outside_the_bounds_is_rejected_and_persists_nothing():
    # Arrange
    h, protocol = _harness_and_protocol()
    before = _types(h, protocol)

    for minutes in (0, 361):
        body = _deploy_body(protocol)
        body["sessions"][0] = {**body["sessions"][0], "duration_minutes": minutes}

        # Act
        response = _deploy(h, protocol, body)

        # Assert
        assert response.status_code == 422
        assert _types(h, protocol) == before
