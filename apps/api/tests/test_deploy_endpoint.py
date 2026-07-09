"""The Protocol Builder deploy endpoint end to end (Module G + F, ADR-0020).

``POST /api/protocols/{id}/deploy`` stages nothing itself — it takes the desired
un-performed tail the Builder assembled client-side, validates it, and on success
replaces that tail **in place**: performed Sessions keep their ids and content, and
the plan's self-paced progress is unchanged. A rejected deploy persists nothing and
names what is wrong. These tests drive the two highest-stakes behaviors (frozen
prefix, empty Session) plus the happy path, over the same in-memory wiring the other
route tests use.
"""

from __future__ import annotations

from datetime import date

from app.domain.load import parse_load
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from tests.test_protocol_endpoint import (
    FakeProtocolGenerator,
    build_harness,
    _kg_protocol,
)


def _deploy_body(protocol: dict, **session_overrides) -> dict:
    """Build a deploy payload that echoes a fetched Protocol's un-performed tail,
    so a bare round-trip is a no-op unless a test edits it."""

    sessions = []
    for session in protocol["sessions"]:
        if session["performed"]:
            continue
        sessions.append(
            {
                "session_id": session["session_id"],
                "week": session["week"],
                "day": session["day"],
                "prescriptions": [
                    {
                        "exercise_id": p["exercise_id"],
                        "sets": p["sets"],
                        "reps": p["reps"],
                        "rest_seconds": p["rest_seconds"],
                        "tempo": p["tempo"],
                        "load_kind": "absolute",
                        "load_value": "",
                    }
                    for p in session["prescriptions"]
                ],
            }
        )
    body = {
        "weeks": protocol["weeks"],
        "sessions_per_week": protocol["sessions_per_week"],
        "sessions": sessions,
    }
    body.update(session_overrides)
    return body


def _perform_week_one(h, sub: str, protocol: dict) -> None:
    """Log a Completed performance of the first Session so it becomes frozen."""

    week_one = protocol["sessions"][0]
    h.logged.create(
        sub,
        LoggedSessionDraft(
            session_id=week_one["session_id"],
            performed_on=date(2026, 1, 1),
            completion_outcome="completed",
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=week_one["prescriptions"][0]["exercise_id"],
                    reps=5,
                    load=parse_load("60 kg").to_dict(),
                    perceived_difficulty=6,
                )
            ],
        ),
    )


def _fresh_protocol(h, sub: str) -> dict:
    protocol_id = h.generate_protocol_id(sub)
    return h.fetch_protocol(sub, protocol_id).json()["data"]


def test_deploy_requires_authentication():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    response = h.client.post("/api/protocols/1/deploy", json={"weeks": 2, "sessions_per_week": 1, "sessions": []})
    assert response.status_code == 401


def test_deploy_edits_an_un_performed_prescription_in_place():
    # Arrange — a fresh two-week kg Protocol, nothing performed yet
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_edit")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    # Retarget Week 1's first Prescription: 3 sets → 5, and set an absolute Load
    body["sessions"][0]["prescriptions"][0]["sets"] = 5
    body["sessions"][0]["prescriptions"][0]["load_kind"] = "absolute"
    body["sessions"][0]["prescriptions"][0]["load_value"] = "80"

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_edit"),
        json=body,
    )

    # Assert — the deployed plan carries the edit
    assert response.status_code == 200
    data = response.json()["data"]
    first = data["sessions"][0]["prescriptions"][0]
    assert first["sets"] == 5
    assert first["recommended_load"] == parse_load("80 kg").to_dict()


def test_deploy_rejects_a_change_to_a_performed_session():
    # Arrange — perform Week 1 so it is frozen, then try to edit it
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_frozen")
    protocol_id = protocol["id"]
    _perform_week_one(h, "user_frozen", protocol)

    frozen_session = protocol["sessions"][0]
    body = _deploy_body(protocol)
    # Smuggle the performed Session back into the tail with an edit
    body["sessions"].insert(
        0,
        {
            "session_id": frozen_session["session_id"],
            "week": frozen_session["week"],
            "day": frozen_session["day"],
            "prescriptions": [
                {
                    "exercise_id": frozen_session["prescriptions"][0]["exercise_id"],
                    "sets": 99,
                    "reps": "1",
                    "rest_seconds": None,
                    "tempo": None,
                    "load_kind": "absolute",
                    "load_value": "",
                }
            ],
        },
    )

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_frozen"),
        json=body,
    )

    # Assert — rejected server-side, naming the frozen Session; nothing persisted
    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    codes = [e["code"] for e in payload["errors"]]
    assert "performed_session_modified" in codes
    offending = next(e for e in payload["errors"] if e["code"] == "performed_session_modified")
    assert offending["session_id"] == frozen_session["session_id"]

    # The Protocol is untouched: Week 1 still has its original single set count
    after = h.fetch_protocol("user_frozen", protocol_id).json()["data"]
    assert after["sessions"][0]["prescriptions"][0]["sets"] == 3


def test_deploy_rejects_an_empty_session_and_persists_nothing():
    # Arrange — strip every Prescription from Week 1
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_empty")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)
    body["sessions"][0]["prescriptions"] = []

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_empty"),
        json=body,
    )

    # Assert — rejected, and the Session still has its Prescription afterward
    assert response.status_code == 422
    assert "empty_session" in [e["code"] for e in response.json()["errors"]]
    after = h.fetch_protocol("user_empty", protocol_id).json()["data"]
    assert len(after["sessions"][0]["prescriptions"]) == 1


def test_deploy_leaves_progress_and_performed_ids_unchanged():
    # Arrange — perform Week 1, then deploy an edit to Week 2 only
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_progress")
    protocol_id = protocol["id"]
    _perform_week_one(h, "user_progress", protocol)
    performed_before = h.fetch_protocol("user_progress", protocol_id).json()["data"]
    frozen_id = performed_before["sessions"][0]["session_id"]

    body = _deploy_body(performed_before)  # excludes the frozen Week 1
    body["sessions"][0]["prescriptions"][0]["reps"] = "8"

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_progress"),
        json=body,
    )

    # Assert — deploy succeeds; Week 1 keeps its id and stays completed, next is Week 2
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sessions"][0]["session_id"] == frozen_id
    assert data["sessions"][0]["performed"] is True
    assert data["completed_count"] == 1
    assert data["next_session"]["week"] == 2
    assert data["next_session"]["prescriptions"][0]["reps"] == "8"


def test_another_user_cannot_deploy_to_someone_elses_protocol():
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol = _fresh_protocol(h, "user_owner")
    protocol_id = protocol["id"]
    body = _deploy_body(protocol)

    response = h.client.post(
        f"/api/protocols/{protocol_id}/deploy",
        headers=h.auth("user_intruder"),
        json=body,
    )
    assert response.status_code == 404
