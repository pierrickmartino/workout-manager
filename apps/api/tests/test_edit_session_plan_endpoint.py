"""Behavior of ``PUT /api/sessions/{id}/plan`` — the Edit endpoint (ADR-0133).

Edit replaces the owner's standalone Session's plan in place: the ordered prescriptions
(reorder, re-time, re-dose, add, drop) plus the Training Type and nominal duration. The
seam under test is the endpoint: assert the returned plan, the preserved invariants
(Provenance, name and Favorite unchanged; the record frozen), the scheme carry, and the
structured error contract — through the envelope and a re-read, not ORM state.

Prior art: ``test_remove_prescription_endpoint``."""

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
    Inserted Overhead Press."""
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


def _edit(client, headers, session_id, prescriptions, **overrides):
    body = {"training_type": "strength", "prescriptions": prescriptions}
    body.update(overrides)
    return client.put(f"/api/sessions/{session_id}/plan", headers=headers, json=body)


def test_edit_reorders_and_redoses_and_keeps_provenance_and_name():
    # Arrange — an AI-generated, named standalone Session with two prescriptions
    client, ctx = build_client()
    headers = _auth(ctx, "editor")
    session = _session_with_two(client, headers)
    client.put(
        f"/api/sessions/{session['id']}/name", headers=headers, json={"name": "Push A"}
    )
    squat_id = session["prescriptions"][0]["exercise_id"]
    press_id = session["prescriptions"][1]["exercise_id"]

    # Act — swap the order and change sets/reps/rest on both
    response = _edit(
        client,
        headers,
        session["id"],
        [
            _prescription_body(press_id, sets=4, reps="6", rest_seconds=120),
            _prescription_body(squat_id, sets=5, reps="5", rest_seconds=180),
        ],
    )

    # Assert — the new order and doses, re-numbered; Provenance and name untouched
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert [p["exercise_id"] for p in data["prescriptions"]] == [press_id, squat_id]
    assert [p["position"] for p in data["prescriptions"]] == [0, 1]
    assert [(p["sets"], p["reps"], p["rest_seconds"]) for p in data["prescriptions"]] == [
        (4, "6", 120),
        (5, "5", 180),
    ]
    assert data["provenance"] == "ai_generated"
    assert data["name"] == "Push A"
    reread = client.get(f"/api/sessions/{session['id']}", headers=headers).json()["data"]
    assert reread["prescriptions"] == data["prescriptions"]


def test_edit_updates_training_type_and_keeps_duration_when_omitted():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "retyper")
    session = _session_with_two(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]

    # Act — change the Training Type, send no duration
    response = _edit(
        client, headers, session["id"], [_prescription_body(squat_id)], training_type="hiit"
    )

    # Assert — the type changes, the nominal duration is the Session's own
    assert response.status_code == 200, response.json()
    data = response.json()["data"]
    assert data["training_type"] == "hiit"
    assert data["duration_minutes"] == session["duration_minutes"]


def test_edit_sets_duration_when_given():
    client, ctx = build_client()
    headers = _auth(ctx, "timer")
    session = _session_with_two(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]

    response = _edit(
        client, headers, session["id"], [_prescription_body(squat_id)], duration_minutes=75
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["duration_minutes"] == 75


def test_edit_carries_a_compatible_scheme():
    # Arrange — Static applies to every Load kind
    client, ctx = build_client()
    headers = _auth(ctx, "schemer")
    session = _session_with_two(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]

    # Act
    response = _edit(
        client, headers, session["id"], [_prescription_body(squat_id, scheme="static")]
    )

    # Assert
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][0]["scheme"] == "static"


def test_edit_resets_a_scheme_the_edited_load_no_longer_fits():
    # Arrange — Greyskull steps a weight axis; a qualitative Load has none. The editor
    # offers no scheme picker, so the stale choice falls back to the default rather than
    # blocking the save.
    client, ctx = build_client()
    headers = _auth(ctx, "reloader")
    session = _session_with_two(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]

    # Act
    response = _edit(
        client,
        headers,
        session["id"],
        [
            _prescription_body(
                squat_id, scheme="greyskull", load_kind="qualitative", load_value="heavy"
            )
        ],
    )

    # Assert
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][0]["scheme"] is None


def test_edit_rejects_an_unknown_scheme():
    client, ctx = build_client()
    headers = _auth(ctx, "typo")
    session = _session_with_two(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]

    response = _edit(
        client, headers, session["id"], [_prescription_body(squat_id, scheme="5x5-magic")]
    )

    assert response.status_code == 422
    assert response.json()["success"] is False


def test_edit_leaves_the_existing_record_frozen():
    # Arrange — a Session with a performance logged against it
    client, ctx = build_client()
    headers = _auth(ctx, "frozen_editor")
    session = _generate_session(client, headers)
    client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )
    history_before = client.get("/api/logs", headers=headers).json()["data"]
    squat_id = session["prescriptions"][0]["exercise_id"]

    # Act — Edit changes only the plan
    response = _edit(
        client, headers, session["id"], [_prescription_body(squat_id, sets=8, reps="3")]
    )

    # Assert — history re-reads unchanged (ADR-0001/0034)
    assert response.status_code == 200, response.json()
    assert client.get("/api/logs", headers=headers).json()["data"] == history_before


def test_edit_to_an_empty_plan_is_rejected_whole():
    client, ctx = build_client()
    headers = _auth(ctx, "emptier")
    session = _session_with_two(client, headers)

    response = _edit(client, headers, session["id"], [])

    assert response.status_code == 422
    body = response.json()
    assert any(error["code"] == "empty_session" for error in body["errors"])
    read = client.get(f"/api/sessions/{session['id']}", headers=headers).json()["data"]
    assert len(read["prescriptions"]) == 2


def test_edit_rejects_an_unknown_training_type():
    client, ctx = build_client()
    headers = _auth(ctx, "badtype")
    session = _session_with_two(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]

    response = _edit(
        client, headers, session["id"], [_prescription_body(squat_id)], training_type="zumba"
    )

    assert response.status_code == 422
    assert response.json()["success"] is False


def test_edit_another_users_session_is_not_found():
    client, ctx = build_client()
    owner = _auth(ctx, "owner")
    session = _session_with_two(client, owner)
    intruder = _auth(ctx, "intruder")
    squat_id = session["prescriptions"][0]["exercise_id"]

    response = _edit(client, intruder, session["id"], [_prescription_body(squat_id)])

    assert response.status_code == 404
    assert response.json()["success"] is False


def test_edit_protocol_member_is_rejected_whole():
    # Arrange — a Protocol-member Session seeded directly (the API builds only standalone
    # ones). Editing inside a Protocol stays Deploy's tail-gated job (ADR-0020/0021).
    client, ctx = build_client()
    headers = _auth(ctx, "proto_owner")
    squat_id = _create_exercise(client, headers, "Back Squat")
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
    ]
    client.sessions._next_id = 2

    # Act
    response = _edit(client, headers, member.id, [_prescription_body(squat_id, sets=9)])

    # Assert — structured 422 naming the scope guard; the plan is unchanged
    assert response.status_code == 422
    body = response.json()
    assert any(error["code"] == "protocol_member" for error in body["errors"])
    read = client.get(f"/api/sessions/{member.id}", headers=headers).json()["data"]
    assert read["prescriptions"][0]["sets"] == 5


def test_edit_requires_authentication():
    client, _ = build_client()

    response = client.put("/api/sessions/1/plan", json={"training_type": "strength"})

    assert response.status_code == 401
    assert response.json()["success"] is False
