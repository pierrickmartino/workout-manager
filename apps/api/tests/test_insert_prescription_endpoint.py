"""Behavior of ``POST /api/sessions/{id}/prescriptions`` — the Insert endpoint (ADR-0051).

Insert appends one hand-authored Exercise Prescription to the owner's standalone Session,
in place, with no AI call. The seam under test is the endpoint: given a Session and a
prescription body, assert the returned plan, the preserved invariants (Provenance
unchanged, record frozen), and the structured error contract — through the envelope and
a re-read, not ORM state. Prior art: ``test_author_plan_endpoint`` and ``test_logs_endpoint``."""

from __future__ import annotations

from app.db.models import ExercisePrescription, WorkoutSession
from app.domain.load import load_from_input
from tests.test_logs_endpoint import (
    _auth,
    _create_exercise,
    _generate_session,
    _log_body,
    build_client,
)


def _prescription_body(exercise_id, **overrides):
    body = {
        "exercise_id": exercise_id,
        "sets": 3,
        "reps": "8-10",
        "rest_seconds": 90,
        "load_kind": "absolute",
        "load_value": "40",
    }
    body.update(overrides)
    return body


def test_insert_appends_the_prescription_last_and_keeps_provenance():
    # Arrange — an AI-generated standalone Session (one Back Squat prescription)
    client, ctx = build_client()
    headers = _auth(ctx, "inserter")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, sets=4, reps="6-8"),
    )

    # Assert — the new prescription is appended last, fully specified
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    prescriptions = data["prescriptions"]
    assert len(prescriptions) == 2
    last = prescriptions[-1]
    assert last["position"] == 1
    assert last["exercise_id"] == press_id
    assert last["sets"] == 4
    assert last["reps"] == "6-8"
    assert last["recommended_load"] == load_from_input("absolute", "40").to_dict()
    # Provenance is immutable origin — inserting keeps an AI plan AI-originated (ADR-0041)
    assert data["provenance"] == "ai_generated"


def test_insert_leaves_the_existing_record_frozen():
    # Arrange — generate a Session, log a performance against it, then Insert a movement
    client, ctx = build_client()
    headers = _auth(ctx, "frozen_inserter")
    session = _generate_session(client, headers)
    client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )
    history_before = client.get("/api/logs", headers=headers).json()["data"]
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — Insert edits only the plan
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id),
    )

    # Assert — the record is untouched: a re-read of history is unchanged (ADR-0001/0034)
    assert response.status_code == 200, response.json()
    assert client.get("/api/logs", headers=headers).json()["data"] == history_before


def test_insert_unknown_exercise_is_rejected_whole():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "bad_inserter")
    session = _generate_session(client, headers)

    # Act — reference an exercise id not in the catalog
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(999999),
    )

    # Assert — structured 422 naming the offending item; the plan is unchanged
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert any(error["code"] == "unknown_exercise" for error in body["errors"])
    read = client.get(f"/api/sessions/{session['id']}", headers=headers).json()["data"]
    assert len(read["prescriptions"]) == 1


def test_insert_into_another_users_session_is_not_found():
    # Arrange — the owner generates a Session
    client, ctx = build_client()
    owner = _auth(ctx, "owner")
    session = _generate_session(client, owner)
    intruder = _auth(ctx, "intruder")
    press_id = _create_exercise(client, intruder, "Overhead Press")

    # Act — a non-owner tries to Insert into it
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=intruder,
        json=_prescription_body(press_id),
    )

    # Assert — 404, so a non-owner can never edit another user's plan
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_insert_into_protocol_member_is_rejected_whole():
    # Arrange — seed a Protocol-member Session owned by the caller directly, because the
    # API only ever builds standalone Sessions. Adding inside a Protocol stays Deploy's
    # job (ADR-0020/0021), so Insert must refuse it at the boundary.
    client, ctx = build_client()
    headers = _auth(ctx, "proto_owner")
    squat_id = _create_exercise(client, headers, "Back Squat")
    press_id = _create_exercise(client, headers, "Overhead Press")
    member = WorkoutSession(
        id=1,
        clerk_user_id="proto_owner",
        training_type="strength",
        duration_minutes=60,
        provenance="ai_generated",
        protocol_id=7,
        week=1,
        day=1,
        position=0,
    )
    client.sessions._sessions[member.id] = member
    client.sessions._prescriptions[member.id] = [
        ExercisePrescription(
            id=1, session_id=member.id, exercise_id=squat_id, position=0, sets=5, reps="5"
        )
    ]
    client.sessions._next_id = 2

    # Act
    response = client.post(
        f"/api/sessions/{member.id}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id),
    )

    # Assert — structured 422 naming the scope guard; the plan is unchanged
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert any(error["code"] == "protocol_member" for error in body["errors"])
    read = client.get(f"/api/sessions/{member.id}", headers=headers).json()["data"]
    assert len(read["prescriptions"]) == 1


def test_insert_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post(
        "/api/sessions/1/prescriptions", json=_prescription_body(1)
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False
