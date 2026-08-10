"""Behavior of ``POST /api/sessions/plan`` — the plan-only author seam (Capture, ADR-0044).

Capture promotes an existing plan-less record into a reusable plan. Because the record
already exists, authoring must create the plan **alone** — a standalone ``user_authored``
Session — and never log a second performance (which would inflate XP, Streak, and records).
The seam under test is the endpoint: given a request, assert the persisted/returned plan,
that no Logged Session was created, and the structured error contract."""

from __future__ import annotations

from app.domain.load import load_from_input
from tests.test_logs_endpoint import _auth, _create_exercise, build_client


def _plan_body(exercise_id, **overrides):
    body = {
        "training_type": "strength",
        "duration_minutes": 40,
        "prescriptions": [
            {
                "exercise_id": exercise_id,
                "sets": 3,
                "reps": "8-10",
                "rest_seconds": 90,
                "load_kind": "absolute",
                "load_value": "60",
            }
        ],
    }
    body.update(overrides)
    return body


def test_authors_a_standalone_user_authored_plan_without_logging():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "capturer")
    exercise_id = _create_exercise(client, headers, "Deadlift")

    # Act — author the plan, then read history
    response = client.post(
        "/api/sessions/plan", headers=headers, json=_plan_body(exercise_id)
    )
    history = client.get("/api/logs", headers=headers).json()["data"]

    # Assert — a standalone user_authored plan is created and carries the prescription
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["provenance"] == "user_authored"
    assert data["training_type"] == "strength"
    prescription = data["prescriptions"][0]
    assert prescription["sets"] == 3
    assert prescription["reps"] == "8-10"
    assert prescription["exercise_id"] == exercise_id
    assert prescription["recommended_load"] == load_from_input("absolute", "60").to_dict()

    # Assert — no performance was logged: the record side is untouched (ADR-0044)
    assert history == []


def test_empty_prescriptions_is_rejected_without_persisting():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "empty_capturer")

    # Act
    response = client.post(
        "/api/sessions/plan",
        headers=headers,
        json={"training_type": "strength", "prescriptions": []},
    )

    # Assert — structured 422 naming the empty session; nothing persisted
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert any(error["code"] == "empty_session" for error in body["errors"])


def test_unknown_exercise_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "bad_exercise_capturer")

    # Act — reference an exercise id not in the catalog
    response = client.post(
        "/api/sessions/plan", headers=headers, json=_plan_body(999999)
    )

    # Assert
    assert response.status_code == 422
    body = response.json()
    assert any(error["code"] == "unknown_exercise" for error in body["errors"])


def test_plan_authoring_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post(
        "/api/sessions/plan",
        json={"training_type": "strength", "prescriptions": []},
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False
