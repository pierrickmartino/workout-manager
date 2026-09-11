"""End-to-end behaviour of the plan-side Target Effort across the plan-edit surfaces
(ADR-0066, #454).

A **Target Effort** is the *prescribed* Effort on an Exercise Prescription — "aim for
RPE 8" / "leave 2 in reserve" — a typed ``{scale, value}`` value logged in either scale.
It is **descriptive** in v1: it feeds the Scheme Preview and the UI but is never a
Progression input. These tests drive the real HTTP surfaces (Insert, the plan-author /
Capture endpoint) through the envelope and a re-read, asserting a target persists and
round-trips in either scale, an invalid value is rejected at the boundary, a blank one is
unset, an un-annotated create (Capture) leaves it unset, and it carries forward with a
Duplicated plan. Substitution and Redeem/Share carry-forward live beside the Set Type
carry-forward tests in ``test_substitution_endpoint`` and ``test_share_endpoint``.
Prior art: ``test_note_endpoint``, ``test_set_type_endpoint``."""

from __future__ import annotations

from tests.test_logs_endpoint import (
    _auth,
    _create_exercise,
    _generate_session,
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


def _plan_body(exercise_id, **overrides):
    # The Capture submit target: POST /api/sessions/plan authors a plan-only, user_authored
    # Session from a plan-less record's pre-fill (ADR-0044).
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


def test_insert_echoes_a_target_effort_in_the_rpe_scale():
    # Arrange — an AI-generated standalone Session
    client, ctx = build_client()
    headers = _auth(ctx, "planner_rpe")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — Insert a movement prescribing "aim for RPE 8"
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="rpe", target_effort_value=8
        ),
    )

    # Assert — the typed target rides back on the appended prescription
    assert response.status_code == 200, response.json()
    last = response.json()["data"]["prescriptions"][-1]
    assert last["target_effort"] == {"scale": "rpe", "value": 8}


def test_insert_echoes_a_target_effort_in_the_rir_scale():
    # A user who thinks in reps-in-reserve prescribes the plan in RIR; the stored scale is
    # preserved verbatim (never re-guessed), so the echo comes back as RIR.
    client, ctx = build_client()
    headers = _auth(ctx, "planner_rir")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="rir", target_effort_value=2
        ),
    )

    assert response.status_code == 200, response.json()
    last = response.json()["data"]["prescriptions"][-1]
    assert last["target_effort"] == {"scale": "rir", "value": 2}


def test_a_half_step_rpe_target_is_accepted():
    # RPE admits half-steps (ADR-0066), so "RPE 7.5" is a valid target, stored as a float.
    client, ctx = build_client()
    headers = _auth(ctx, "planner_half")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="rpe", target_effort_value=7.5
        ),
    )

    assert response.status_code == 200, response.json()
    last = response.json()["data"]["prescriptions"][-1]
    assert last["target_effort"] == {"scale": "rpe", "value": 7.5}


def test_the_plan_author_endpoint_accepts_and_echoes_a_target_effort():
    # The hand-authored plan surface can author a Target Effort — proving it is not
    # Capture-only; a user authoring a plan by hand can prescribe how hard to push.
    client, ctx = build_client()
    headers = _auth(ctx, "author_target")
    exercise_id = _create_exercise(client, headers, "Deadlift")

    response = client.post(
        "/api/sessions/plan",
        headers=headers,
        json=_plan_body(
            exercise_id,
            prescriptions=[
                {
                    "exercise_id": exercise_id,
                    "sets": 3,
                    "reps": "5",
                    "load_kind": "absolute",
                    "load_value": "100",
                    "target_effort_scale": "rpe",
                    "target_effort_value": 9,
                }
            ],
        ),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][0]["target_effort"] == {
        "scale": "rpe",
        "value": 9,
    }


def test_capture_authors_a_plan_with_the_target_effort_left_unset():
    # Drives the real Capture submit path (POST /api/sessions/plan) with a prescription that
    # carries no target — the seed never fabricates a plan target from a record (ADR-0066),
    # so the authored plan reads target_effort null.
    client, ctx = build_client()
    headers = _auth(ctx, "capturer_target_null")
    exercise_id = _create_exercise(client, headers, "Deadlift")

    response = client.post(
        "/api/sessions/plan", headers=headers, json=_plan_body(exercise_id)
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][0]["target_effort"] is None


def test_an_absent_target_effort_normalizes_to_unset():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "planner_none")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — no target fields at all is "no target"
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id),
    )

    # Assert — stored as unset (null), not a spurious zero
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][-1]["target_effort"] is None


def test_an_rpe_value_with_no_scale_defaults_to_rpe():
    # A value present with no explicit scale defaults to RPE — an rpe-only client can
    # prescribe a target without picking a scale (mirrors the log form's effort default).
    client, ctx = build_client()
    headers = _auth(ctx, "planner_default_scale")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, target_effort_value=8),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][-1]["target_effort"] == {
        "scale": "rpe",
        "value": 8,
    }


def test_an_out_of_range_rpe_target_is_rejected_at_the_boundary():
    # An invalid value is a 422 at the boundary, never coerced or stored as a guessed number.
    client, ctx = build_client()
    headers = _auth(ctx, "planner_bad_rpe")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="rpe", target_effort_value=11
        ),
    )

    assert response.status_code == 422


def test_a_fractional_rir_target_is_rejected_at_the_boundary():
    # RIR is an integer 0–5; a fractional RIR is a client bug rejected at the boundary.
    client, ctx = build_client()
    headers = _auth(ctx, "planner_bad_rir")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="rir", target_effort_value=2.5
        ),
    )

    assert response.status_code == 422


def test_an_unknown_target_effort_scale_is_rejected_at_the_boundary():
    client, ctx = build_client()
    headers = _auth(ctx, "planner_bad_scale")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="bogus", target_effort_value=8
        ),
    )

    assert response.status_code == 422


def test_target_effort_carries_forward_across_duplicate():
    # Arrange — a Session whose appended movement prescribes a target
    client, ctx = build_client()
    headers = _auth(ctx, "duplicator_target")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")
    client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(
            press_id, target_effort_scale="rir", target_effort_value=2
        ),
    )

    # Act — Duplicate the whole plan into an independent copy
    duplicate = client.post(
        f"/api/sessions/{session['id']}/duplicate", headers=headers
    )

    # Assert — the copied plan preserves the movement's target (a plan property)
    assert duplicate.status_code == 200, duplicate.json()
    copied = duplicate.json()["data"]["prescriptions"][-1]
    assert copied["target_effort"] == {"scale": "rir", "value": 2}
