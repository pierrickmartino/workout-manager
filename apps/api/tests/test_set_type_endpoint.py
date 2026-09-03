"""End-to-end behaviour of the Set Type annotation across the plan and record surfaces
(ADR-0065, #449).

Set Type is a descriptive, curated label — warm-up / working / drop / failure / AMRAP —
that a user tags onto a movement line (plan) and a performed set (record). These tests
drive the real HTTP surfaces (Insert, Duplicate, the log form, Log Correction) through the
envelope and a re-read, asserting the tag persists, round-trips, carries forward with a
copied plan, and that an invalid value is rejected at the boundary rather than coerced.
Prior art: ``test_insert_prescription_endpoint`` and ``test_logs_endpoint``."""

from __future__ import annotations

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


# --- Plan side ---------------------------------------------------------------


def test_insert_echoes_a_set_type_on_the_prescription():
    # Arrange — an AI-generated standalone Session
    client, ctx = build_client()
    headers = _auth(ctx, "planner")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — Insert a warm-up-tagged movement
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, set_type="warm_up"),
    )

    # Assert — the tag rides back on the appended prescription
    assert response.status_code == 200, response.json()
    last = response.json()["data"]["prescriptions"][-1]
    assert last["set_type"] == "warm_up"


def test_an_untagged_prescription_serializes_set_type_as_null():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "planner_null")
    session = _generate_session(client, headers)

    # Act — read the generated plan, which tags no Set Type
    read = client.get(f"/api/sessions/{session['id']}", headers=headers)

    # Assert — an unset Set Type is null (resolves to working, no badge), never coerced
    assert read.status_code == 200
    assert read.json()["data"]["prescriptions"][0]["set_type"] is None


def test_an_invalid_set_type_is_rejected_at_the_boundary():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "planner_bad")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — a value outside the curated catalog
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, set_type="superset"),
    )

    # Assert — 422 at the boundary; nothing coerced to working
    assert response.status_code == 422


def test_a_blank_set_type_normalizes_to_unset():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "planner_blank")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — a blank selection is the un-annotated default
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, set_type=""),
    )

    # Assert — stored as unset (null), not the empty string
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][-1]["set_type"] is None


def test_set_type_carries_forward_across_duplicate():
    # Arrange — a Session whose appended movement is tagged AMRAP
    client, ctx = build_client()
    headers = _auth(ctx, "duplicator")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")
    client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, set_type="amrap"),
    )

    # Act — Duplicate the whole plan into an independent copy
    duplicate = client.post(
        f"/api/sessions/{session['id']}/duplicate", headers=headers
    )

    # Assert — the copied plan preserves the movement's Set Type (a plan property)
    assert duplicate.status_code == 200, duplicate.json()
    copied = duplicate.json()["data"]["prescriptions"][-1]
    assert copied["set_type"] == "amrap"


# --- Record side -------------------------------------------------------------


def test_log_form_echoes_a_per_set_set_type():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "logger")
    session = _generate_session(client, headers)
    body = _log_body(session)
    body["logged_sets"][0]["set_type"] = "failure"

    # Act — log a performance tagging the set as taken to failure
    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — the record echoes the per-set tag
    assert response.status_code == 200, response.json()
    logged_set = response.json()["data"]["logged_sets"][0]
    assert logged_set["set_type"] == "failure"


def test_an_untagged_logged_set_serializes_set_type_as_null():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "logger_null")
    session = _generate_session(client, headers)

    # Act — the default log body tags no Set Type
    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — an unset record Set Type is null (reads as working)
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["logged_sets"][0]["set_type"] is None


def test_an_invalid_logged_set_type_is_rejected_at_the_boundary():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "logger_bad")
    session = _generate_session(client, headers)
    body = _log_body(session)
    body["logged_sets"][0]["set_type"] = "circuit"

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — 422 at the boundary, never coerced
    assert response.status_code == 422


def test_log_correction_round_trips_a_set_type():
    # Arrange — a logged performance with an untagged set
    client, ctx = build_client()
    headers = _auth(ctx, "corrector")
    session = _generate_session(client, headers)
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    ).json()["data"]
    assert created["logged_sets"][0]["set_type"] is None

    # Act — correct the record, this time tagging the set a drop set
    correction = _log_body(session)
    correction["logged_sets"][0]["set_type"] = "drop"
    response = client.put(
        f"/api/logs/{created['id']}", headers=headers, json=correction
    )

    # Assert — the corrected record carries the new tag
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["logged_sets"][0]["set_type"] == "drop"
