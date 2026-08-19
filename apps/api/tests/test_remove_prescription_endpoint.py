"""Behavior of ``DELETE /api/sessions/{id}/prescriptions/{position}`` — the Remove
endpoint (ADR-0052).

Remove withdraws one Exercise Prescription from the owner's standalone Session, in
place, with no AI call — Insert's symmetric partner. The seam under test is the
endpoint: given a Session and a position, assert the returned plan, the re-numbered
survivors, the preserved invariants (Provenance unchanged, record frozen), and the
structured error contract — through the envelope and a re-read, not ORM state.

Prior art: ``test_insert_prescription_endpoint``."""

from __future__ import annotations

from app.db.models import ExercisePrescription, WorkoutSession
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


def _session_with_two(client, headers) -> dict:
    """A standalone Session with two prescriptions: the generated Back Squat plus an
    Inserted Overhead Press, so Remove has something to drop without emptying it."""
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")
    client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id),
    )
    return client.get(
        f"/api/sessions/{session['id']}", headers=headers
    ).json()["data"]


def test_remove_drops_the_prescription_and_renumbers_and_keeps_provenance():
    # Arrange — an AI-generated standalone Session with two prescriptions
    client, ctx = build_client()
    headers = _auth(ctx, "remover")
    session = _session_with_two(client, headers)
    survivor_id = session["prescriptions"][1]["exercise_id"]

    # Act — remove the first prescription
    response = client.delete(
        f"/api/sessions/{session['id']}/prescriptions/0", headers=headers
    )

    # Assert — only the survivor remains, re-numbered to position 0, Provenance intact
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert len(data["prescriptions"]) == 1
    assert data["prescriptions"][0]["exercise_id"] == survivor_id
    assert data["prescriptions"][0]["position"] == 0
    assert data["provenance"] == "ai_generated"


def test_remove_leaves_the_existing_record_frozen():
    # Arrange — a Session with a performance logged against it, then a second prescription
    client, ctx = build_client()
    headers = _auth(ctx, "frozen_remover")
    session = _generate_session(client, headers)
    client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )
    press_id = _create_exercise(client, headers, "Overhead Press")
    client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id),
    )
    history_before = client.get("/api/logs", headers=headers).json()["data"]

    # Act — Remove edits only the plan
    response = client.delete(
        f"/api/sessions/{session['id']}/prescriptions/1", headers=headers
    )

    # Assert — the record is untouched: a re-read of history is unchanged (ADR-0001/0034)
    assert response.status_code == 200, response.json()
    assert client.get("/api/logs", headers=headers).json()["data"] == history_before


def test_remove_last_remaining_prescription_is_rejected_whole():
    # Arrange — the generated Session holds a single prescription
    client, ctx = build_client()
    headers = _auth(ctx, "emptier")
    session = _generate_session(client, headers)

    # Act — try to remove the only movement
    response = client.delete(
        f"/api/sessions/{session['id']}/prescriptions/0", headers=headers
    )

    # Assert — structured 422 naming the empty-guard; the plan is unchanged
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert any(error["code"] == "would_empty_session" for error in body["errors"])
    read = client.get(f"/api/sessions/{session['id']}", headers=headers).json()["data"]
    assert len(read["prescriptions"]) == 1


def test_remove_missing_position_is_not_found():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "misser")
    session = _session_with_two(client, headers)

    # Act — a position with no prescription
    response = client.delete(
        f"/api/sessions/{session['id']}/prescriptions/9", headers=headers
    )

    # Assert — 404; the plan is unchanged
    assert response.status_code == 404
    assert response.json()["success"] is False
    read = client.get(f"/api/sessions/{session['id']}", headers=headers).json()["data"]
    assert len(read["prescriptions"]) == 2


def test_remove_from_another_users_session_is_not_found():
    # Arrange — the owner builds a two-prescription Session
    client, ctx = build_client()
    owner = _auth(ctx, "owner")
    session = _session_with_two(client, owner)
    intruder = _auth(ctx, "intruder")

    # Act — a non-owner tries to Remove from it
    response = client.delete(
        f"/api/sessions/{session['id']}/prescriptions/0", headers=intruder
    )

    # Assert — 404, so a non-owner can never edit another user's plan
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_remove_from_protocol_member_is_rejected_whole():
    # Arrange — seed a Protocol-member Session owned by the caller directly, because the
    # API only ever builds standalone Sessions. Removing inside a Protocol stays Deploy's
    # job (ADR-0020/0021), so Remove must refuse it at the boundary.
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
        ),
        ExercisePrescription(
            id=2, session_id=member.id, exercise_id=press_id, position=1, sets=3, reps="8"
        ),
    ]
    client.sessions._next_id = 2

    # Act
    response = client.delete(
        f"/api/sessions/{member.id}/prescriptions/0", headers=headers
    )

    # Assert — structured 422 naming the scope guard; the plan is unchanged
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert any(error["code"] == "protocol_member" for error in body["errors"])
    read = client.get(f"/api/sessions/{member.id}", headers=headers).json()["data"]
    assert len(read["prescriptions"]) == 2


def test_remove_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.delete("/api/sessions/1/prescriptions/0")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False
