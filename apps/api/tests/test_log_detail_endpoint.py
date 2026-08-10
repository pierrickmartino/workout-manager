"""Behavior of ``GET /api/logs/{id}`` — the single Logged Session detail read.

The history list has always been able to serve one record's full shape; this route
exposes it so a Logged Session gets a stable, linkable home (the record side's
counterpart to ``GET /api/sessions/{id}``). Owner-scoped: another user's record, or a
missing one, is ``404`` — never served. Repositories are injected offline via the shared
``build_client`` harness."""

from __future__ import annotations

from app.domain.load import load_from_input
from tests.quantities import reps_quantity
from tests.test_logs_endpoint import (
    _adhoc_body,
    _auth,
    _create_exercise,
    build_client,
)


def test_owner_reads_a_single_logged_session_in_full():
    # Arrange — an ad-hoc (plan-less) record is logged
    client, ctx = build_client()
    headers = _auth(ctx, "detail_owner")
    exercise_id = _create_exercise(client, headers, "Air Squat")
    created = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(exercise_id)
    ).json()["data"]

    # Act
    response = client.get(f"/api/logs/{created['id']}", headers=headers)

    # Assert — the full record round-trips, matching the list serializer's shape
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == created["id"]
    assert data["session_id"] is None
    assert data["training_type"] == "cardio"
    assert data["performed_on"] == "2026-06-20"
    assert data["logged_sets"][0]["quantity"] == reps_quantity(30)
    assert data["logged_sets"][0]["load"] == load_from_input("bodyweight", "0").to_dict()
    assert data["logged_sets"][0]["exercise_name"] == "Air Squat"


def test_another_users_record_is_not_found():
    # Arrange — one user logs; a different user asks for it
    client, ctx = build_client()
    owner = _auth(ctx, "record_owner")
    exercise_id = _create_exercise(client, owner, "Lunge")
    created = client.post("/api/logs", headers=owner, json=_adhoc_body(exercise_id)).json()[
        "data"
    ]

    # Act
    response = client.get(f"/api/logs/{created['id']}", headers=_auth(ctx, "intruder"))

    # Assert — owner-scoped: an intruder can never open another user's record
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_missing_record_is_not_found():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.get("/api/logs/999999", headers=_auth(ctx, "seeker"))

    # Assert
    assert response.status_code == 404


def test_detail_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.get("/api/logs/1")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False
