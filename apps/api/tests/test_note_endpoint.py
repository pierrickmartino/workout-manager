"""End-to-end behaviour of the Exercise Note and Set Note across the plan and record
surfaces (ADR-0065, #451).

An **Exercise Note** is a plan-side coaching cue on a movement; a **Set Note** is a
record-side remark on a performed set. Both are optional free text, length-capped and
**HTML-escaped at the write boundary** so pasted markup can never inject into the UI. These
tests drive the real HTTP surfaces (Insert, the log form, Log Correction) through the
envelope and a re-read, asserting each note persists, round-trips, is escaped, and — for the
plan note — carries forward with a Duplicated plan and is left unset by an un-annotated
create (Capture). Substitution/Redeem/Share carry-forward live beside the Set Type carry-
forward tests in ``test_substitution_endpoint`` and ``test_share_endpoint``.
Prior art: ``test_set_type_endpoint``."""

from __future__ import annotations

from app.domain.note import MAX_NOTE_LENGTH
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


# --- Plan side: Exercise Note ------------------------------------------------


def test_insert_echoes_an_exercise_note_on_the_prescription():
    # Arrange — an AI-generated standalone Session
    client, ctx = build_client()
    headers = _auth(ctx, "planner")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — Insert a movement carrying a coaching cue
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, note="pause on the chest"),
    )

    # Assert — the cue rides back on the appended prescription
    assert response.status_code == 200, response.json()
    last = response.json()["data"]["prescriptions"][-1]
    assert last["note"] == "pause on the chest"


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


def test_capture_authors_a_plan_with_the_exercise_note_left_unset():
    # Drives the real Capture submit path (POST /api/sessions/plan) with a prescription that
    # carries no note — the seed never fabricates a plan cue from a record (ADR-0065), so the
    # authored plan reads note null.
    client, ctx = build_client()
    headers = _auth(ctx, "capturer_null")
    exercise_id = _create_exercise(client, headers, "Deadlift")

    response = client.post(
        "/api/sessions/plan", headers=headers, json=_plan_body(exercise_id)
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][0]["note"] is None


def test_the_plan_author_endpoint_accepts_and_echoes_an_exercise_note():
    # The hand-authored plan surface can author an Exercise Note (escaped at the boundary),
    # proving the note is not Capture-only — a user authoring a plan by hand can add a cue.
    client, ctx = build_client()
    headers = _auth(ctx, "author_note")
    exercise_id = _create_exercise(client, headers, "Deadlift")

    response = client.post(
        "/api/sessions/plan",
        headers=headers,
        json=_plan_body(exercise_id, prescriptions=[
            {
                "exercise_id": exercise_id,
                "sets": 3,
                "reps": "5",
                "load_kind": "absolute",
                "load_value": "100",
                "note": "brace hard",
            }
        ]),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][0]["note"] == "brace hard"


def test_a_blank_exercise_note_normalizes_to_unset():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "planner_blank")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    # Act — a whitespace-only note is "no note"
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, note="   "),
    )

    # Assert — stored as unset (null), not an empty/whitespace string
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["prescriptions"][-1]["note"] is None


def test_an_exercise_note_with_markup_is_escaped_at_the_boundary():
    # The security invariant (ADR-0065/0036): a pasted string with markup is stored inert, so
    # it can never open a tag when rendered — covered end to end here.
    client, ctx = build_client()
    headers = _auth(ctx, "planner_xss")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, note="<script>alert('x')</script>"),
    )

    assert response.status_code == 200, response.json()
    note = response.json()["data"]["prescriptions"][-1]["note"]
    assert "<script>" not in note
    assert note == "&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;"


def test_an_over_long_exercise_note_is_rejected_at_the_boundary():
    # Length-capped at the boundary: an over-long cue is a 422, never a silently truncated note.
    client, ctx = build_client()
    headers = _auth(ctx, "planner_toolong")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, note="a" * (MAX_NOTE_LENGTH + 1)),
    )

    assert response.status_code == 422


def test_exercise_note_carries_forward_across_duplicate():
    # Arrange — a Session whose appended movement carries a cue
    client, ctx = build_client()
    headers = _auth(ctx, "duplicator")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")
    client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, note="brace hard"),
    )

    # Act — Duplicate the whole plan into an independent copy
    duplicate = client.post(
        f"/api/sessions/{session['id']}/duplicate", headers=headers
    )

    # Assert — the copied plan preserves the movement's cue (a plan property), un-re-escaped
    assert duplicate.status_code == 200, duplicate.json()
    copied = duplicate.json()["data"]["prescriptions"][-1]
    assert copied["note"] == "brace hard"


def test_an_escaped_exercise_note_is_not_double_escaped_by_duplicate():
    # Carry-forward copies the already-escaped stored value verbatim — escaping happens once, at
    # the write boundary, so a Duplicated markup note is not escaped a second time.
    client, ctx = build_client()
    headers = _auth(ctx, "duplicator_xss")
    session = _generate_session(client, headers)
    press_id = _create_exercise(client, headers, "Overhead Press")
    client.post(
        f"/api/sessions/{session['id']}/prescriptions",
        headers=headers,
        json=_prescription_body(press_id, note="a & b"),
    )

    duplicate = client.post(
        f"/api/sessions/{session['id']}/duplicate", headers=headers
    )

    copied = duplicate.json()["data"]["prescriptions"][-1]
    assert copied["note"] == "a &amp; b"  # escaped once, not "a &amp;amp; b"


# --- Record side: Set Note ---------------------------------------------------


def test_log_form_echoes_a_per_set_set_note():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "logger")
    session = _generate_session(client, headers)
    body = _log_body(session)
    body["logged_sets"][0]["note"] = "felt easy"

    # Act — log a performance leaving a per-set remark
    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — the record echoes the per-set note
    assert response.status_code == 200, response.json()
    logged_set = response.json()["data"]["logged_sets"][0]
    assert logged_set["note"] == "felt easy"


def test_an_un_annotated_logged_set_serializes_note_as_null():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "logger_null")
    session = _generate_session(client, headers)

    # Act — the default log body leaves no note
    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — an unset Set Note is null (renders as nothing)
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["logged_sets"][0]["note"] is None


def test_a_set_note_with_markup_is_escaped_at_the_boundary():
    # The same DOM-XSS invariant on the record side: a pasted markup note is stored inert.
    client, ctx = build_client()
    headers = _auth(ctx, "logger_xss")
    session = _generate_session(client, headers)
    body = _log_body(session)
    body["logged_sets"][0]["note"] = "<img src=x onerror=alert(1)>"

    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    assert response.status_code == 200, response.json()
    note = response.json()["data"]["logged_sets"][0]["note"]
    assert "<img" not in note
    assert note == "&lt;img src=x onerror=alert(1)&gt;"


def test_an_over_long_set_note_is_rejected_at_the_boundary():
    client, ctx = build_client()
    headers = _auth(ctx, "logger_toolong")
    session = _generate_session(client, headers)
    body = _log_body(session)
    body["logged_sets"][0]["note"] = "a" * (MAX_NOTE_LENGTH + 1)

    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    assert response.status_code == 422


def test_log_correction_edits_a_set_note():
    # Arrange — a logged performance with no note on its set
    client, ctx = build_client()
    headers = _auth(ctx, "corrector")
    session = _generate_session(client, headers)
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    ).json()["data"]
    assert created["logged_sets"][0]["note"] is None

    # Act — correct the record, this time leaving a remark on the set (Set Note is editable
    # through Log Correction like any other Logged Set field, ADR-0065)
    correction = _log_body(session)
    correction["logged_sets"][0]["note"] = "left knee twinge"
    response = client.put(
        f"/api/logs/{created['id']}", headers=headers, json=correction
    )

    # Assert — the corrected record carries the new note
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["logged_sets"][0]["note"] == "left knee twinge"
