"""Behavior of the session-logging endpoints end to end: real JWKS verification,
the repositories, the logbook service, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

A user generates a Session (Slice 3), logs a performance against it, and reads
their history back. Ownership and validation are enforced at the boundary."""

from __future__ import annotations

from tests.quantities import reps_quantity

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.load import load_from_input
from app.domain.quantity import quantity_from_input
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat",
                    exercise_description="Compound lower-body lift.",
                    targeted_muscles=["quads"],
                    required_equipment=["barbell"],
                    sets=5,
                    reps="5",
                    rest_seconds=120,
                    tempo="3-1-1",
                    recommended_load="70% 1RM",
                )
            ]
        )


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: InMemoryProfileRepository()
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _generate_session(client, headers) -> dict:
    return client.post(
        "/api/sessions/generate",
        headers=headers,
        json={
            "training_type": "strength",
            "duration_minutes": 45,
            "equipment": ["barbell"],
        },
    ).json()["data"]


def _log_body(session, **overrides):
    exercise_id = session["prescriptions"][0]["exercise_id"]
    body = {
        "performed_on": "2026-06-20",
        "logged_sets": [
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "70",
                "perceived_difficulty": 8,
            }
        ],
    }
    body.update(overrides)
    return body


def _create_exercise(client, headers, name) -> int:
    """Resolve-or-create a catalog Exercise by name (ADR-0033) and return its id."""
    return client.post(
        "/api/exercises", headers=headers, json={"name": name}
    ).json()["data"]["id"]


def _adhoc_body(exercise_id, **overrides):
    body = {
        "performed_on": "2026-06-20",
        "training_type": "cardio",
        "logged_sets": [
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "30",
                "load_kind": "bodyweight",
                "load_value": "0",
            }
        ],
    }
    body.update(overrides)
    return body


def test_logging_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post(
        "/api/sessions/1/logs", json={"performed_on": "2026-06-20", "logged_sets": []}
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_user_logs_a_performance_and_reads_it_back_in_history():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_logger")
    session = _generate_session(client, headers)

    # Act — log a performance, then fetch history
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )
    history = client.get("/api/logs", headers=headers)

    # Assert — the logged performance round-trips with its set and perceived difficulty
    assert logged.status_code == 200
    data = logged.json()["data"]
    assert data["session_id"] == session["id"]
    assert data["performed_on"] == "2026-06-20"
    assert data["training_type"] == "strength"
    assert data["logged_sets"][0]["quantity"] == reps_quantity(5)
    assert data["logged_sets"][0]["load"] == load_from_input("absolute", "70").to_dict()
    assert data["logged_sets"][0]["perceived_difficulty"] == 8
    assert data["logged_sets"][0]["exercise_name"] == "Back Squat"

    entries = history.json()["data"]
    assert len(entries) == 1
    assert entries[0]["id"] == data["id"]


def test_client_declared_completion_outcome_is_persisted_and_serialized():
    # Arrange — the client declares the performance Incomplete (ADR-0013)
    client, ctx = build_client()
    headers = _auth(ctx, "user_outcome")
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, completion_outcome="incomplete"),
    )

    # Assert — the declared outcome round-trips in the serialized view
    assert logged.status_code == 200
    assert logged.json()["data"]["completion_outcome"] == "incomplete"


def test_completion_outcome_is_optional_and_defaults_to_null():
    # Arrange — a log that never declares an outcome
    client, ctx = build_client()
    headers = _auth(ctx, "user_no_outcome")
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — an undeclared outcome serializes as null
    assert logged.status_code == 200
    assert logged.json()["data"]["completion_outcome"] is None


def test_an_explicit_null_completion_outcome_is_accepted():
    # Arrange — a client that sends the field but declares no outcome
    client, ctx = build_client()
    headers = _auth(ctx, "user_null_outcome")
    session = _generate_session(client, headers)

    # Act — an explicit null passes the boundary validator untouched
    logged = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, completion_outcome=None),
    )

    # Assert
    assert logged.status_code == 200
    assert logged.json()["data"]["completion_outcome"] is None


def test_an_unknown_completion_outcome_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_bad_outcome")
    session = _generate_session(client, headers)

    # Act — "failed" is not a domain outcome (ADR-0013 rejects the collision term)
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, completion_outcome="failed"),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_recorded_session_duration_is_persisted_and_serialized():
    # Arrange — a live-tracked performance carrying its Session Duration (ADR-0014)
    client, ctx = build_client()
    headers = _auth(ctx, "user_duration")
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, duration_seconds=1830),
    )

    # Assert — the recorded duration round-trips in the serialized view
    assert logged.status_code == 200
    assert logged.json()["data"]["duration_seconds"] == 1830


def test_duration_seconds_is_optional_and_defaults_to_null():
    # Arrange — a log that never records a duration (the static form path)
    client, ctx = build_client()
    headers = _auth(ctx, "user_no_duration")
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — an unrecorded duration serializes as null
    assert logged.status_code == 200
    assert logged.json()["data"]["duration_seconds"] is None


def test_a_negative_duration_seconds_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_bad_duration")
    session = _generate_session(client, headers)

    # Act — a duration can never run backwards
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, duration_seconds=-5),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_same_session_logged_twice_yields_two_history_entries():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_twice")
    session = _generate_session(client, headers)

    # Act — two performances of the same Session
    client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, performed_on="2026-06-20"),
    )
    client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, performed_on="2026-06-27"),
    )
    history = client.get("/api/logs", headers=headers).json()["data"]

    # Assert — recorded separately, newest first
    assert len(history) == 2
    assert [e["performed_on"] for e in history] == ["2026-06-27", "2026-06-20"]


def test_user_cannot_log_another_users_session():
    # Arrange — owner generates a Session
    client, ctx = build_client()
    owner_headers = _auth(ctx, "user_owner")
    session = _generate_session(client, owner_headers)

    # Act — a different user tries to log against it
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=_auth(ctx, "user_intruder"),
        json=_log_body(session),
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_history_is_scoped_to_the_requesting_user():
    # Arrange — owner logs a performance
    client, ctx = build_client()
    owner_headers = _auth(ctx, "user_owner")
    session = _generate_session(client, owner_headers)
    client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=owner_headers,
        json=_log_body(session),
    )

    # Act — a different user requests their (empty) history
    history = client.get("/api/logs", headers=_auth(ctx, "user_other"))

    # Assert
    assert history.status_code == 200
    assert history.json()["data"] == []


def test_logging_an_unknown_exercise_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_badexercise")
    session = _generate_session(client, headers)

    # Act — reference an exercise id that is not in the catalog
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, logged_sets=[{"exercise_id": 9999, "quantity_value": "5"}]),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_user_logs_a_plan_less_session_and_reads_it_back_in_history():
    # Arrange — a run nobody prescribed: pick a catalog Exercise, then log it ad-hoc
    client, ctx = build_client()
    headers = _auth(ctx, "user_adhoc")
    running = _create_exercise(client, headers, "Running")

    # Act — post to /api/logs (no session id in the path), then read history
    logged = client.post("/api/logs", headers=headers, json=_adhoc_body(running))
    history = client.get("/api/logs", headers=headers)

    # Assert — it stands alone: no Session, its own training type, no Completion Outcome
    assert logged.status_code == 200
    data = logged.json()["data"]
    assert data["session_id"] is None
    assert data["training_type"] == "cardio"
    assert data["completion_outcome"] is None
    assert data["performed_on"] == "2026-06-20"
    assert data["logged_sets"][0]["quantity"] == reps_quantity(30)
    assert data["logged_sets"][0]["exercise_name"] == "Running"

    entries = history.json()["data"]
    assert len(entries) == 1
    assert entries[0]["id"] == data["id"]


def test_plan_less_log_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post(
        "/api/logs", json={"performed_on": "2026-06-20", "training_type": "cardio", "logged_sets": []}
    )

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_plan_less_log_missing_a_training_type_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_no_type")
    running = _create_exercise(client, headers, "Running")

    # Act — the training type is required for a plan-less record (ADR-0031)
    body = _adhoc_body(running)
    del body["training_type"]
    response = client.post("/api/logs", headers=headers, json=body)

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_plan_less_log_carrying_a_session_id_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_bad_session")
    running = _create_exercise(client, headers, "Running")

    # Act — a session id has no place on the plan-less route (would gate a Protocol)
    response = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(running, session_id=1)
    )

    # Assert — the boundary rejects it
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_plan_less_log_carrying_a_completion_outcome_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_bad_outcome_adhoc")
    running = _create_exercise(client, headers, "Running")

    # Act — an ad-hoc record declares no Completion Outcome (ADR-0031)
    response = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(running, completion_outcome="completed")
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_plan_less_log_with_an_unknown_exercise_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_adhoc_badexercise")

    # Act — reference an exercise id that is not in the catalog
    response = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(9999)
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_plan_less_log_records_a_timed_distance_run():
    # Arrange — the run that motivated all this: 10 km in 52:00, logged plan-less
    client, ctx = build_client()
    headers = _auth(ctx, "user_distance")
    running = _create_exercise(client, headers, "Running")
    body = _adhoc_body(
        running,
        logged_sets=[
            {
                "exercise_id": running,
                "quantity_kind": "distance",
                "quantity_value": "10",
                "quantity_unit": "km",
                "quantity_duration": "52:00",
                "load_kind": "qualitative",
                "load_value": None,
            }
        ],
    )

    # Act
    logged = client.post("/api/logs", headers=headers, json=body)
    history = client.get("/api/logs", headers=headers)

    # Assert — the distance is stored canonically in metres with its companion time,
    # and the display text is preserved verbatim ("10 km", exactly as entered)
    assert logged.status_code == 200
    quantity = logged.json()["data"]["logged_sets"][0]["quantity"]
    assert quantity == quantity_from_input(
        "distance", "10", unit="km", duration="52:00"
    ).to_dict()
    assert quantity["text"] == "10 km"
    assert quantity["metres"] == 10000
    assert quantity["duration_s"] == 3120

    # And it round-trips in history unchanged
    assert history.json()["data"][0]["logged_sets"][0]["quantity"] == quantity


def test_plan_less_log_stores_a_miles_distance_canonically_in_metres():
    # Arrange — a 3 mile run; miles convert to metres on the way in
    client, ctx = build_client()
    headers = _auth(ctx, "user_miles")
    running = _create_exercise(client, headers, "Running")
    body = _adhoc_body(
        running,
        logged_sets=[
            {
                "exercise_id": running,
                "quantity_kind": "distance",
                "quantity_value": "3",
                "quantity_unit": "mi",
                "load_kind": "qualitative",
                "load_value": None,
            }
        ],
    )

    # Act
    logged = client.post("/api/logs", headers=headers, json=body)

    # Assert — stored in canonical metres, but the text still reads as the user typed it
    assert logged.status_code == 200
    quantity = logged.json()["data"]["logged_sets"][0]["quantity"]
    assert quantity["metres"] == 1609.344 * 3
    assert quantity["text"] == "3 mi"


def test_plan_less_log_records_an_interval_session_as_many_distance_sets():
    # Arrange — a 6 × 800 m interval session: six distance sets in one Logged Session
    client, ctx = build_client()
    headers = _auth(ctx, "user_intervals")
    running = _create_exercise(client, headers, "Running")
    rep = {
        "exercise_id": running,
        "quantity_kind": "distance",
        "quantity_value": "0.8",
        "quantity_unit": "km",
        "load_kind": "qualitative",
        "load_value": None,
    }
    body = _adhoc_body(running, logged_sets=[dict(rep) for _ in range(6)])

    # Act
    logged = client.post("/api/logs", headers=headers, json=body)

    # Assert — all six reps land as one session's heterogeneous-free distance sets
    assert logged.status_code == 200
    sets = logged.json()["data"]["logged_sets"]
    assert len(sets) == 6
    assert all(s["quantity"]["metres"] == 800 for s in sets)


def test_plan_less_log_records_a_mixed_run_then_strength_session():
    # Arrange — a run then some squats: one Logged Session with heterogeneous kinds
    client, ctx = build_client()
    headers = _auth(ctx, "user_mixed")
    running = _create_exercise(client, headers, "Running")
    squat = _create_exercise(client, headers, "Back Squat")
    body = _adhoc_body(
        running,
        training_type="strength",
        logged_sets=[
            {
                "exercise_id": running,
                "quantity_kind": "distance",
                "quantity_value": "5",
                "quantity_unit": "km",
                "load_kind": "qualitative",
                "load_value": None,
            },
            {
                "exercise_id": squat,
                "quantity_kind": "repetitions",
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "100",
            },
        ],
    )

    # Act
    logged = client.post("/api/logs", headers=headers, json=body)

    # Assert — the two kinds coexist in one record, each typed by its own picked kind
    assert logged.status_code == 200
    sets = logged.json()["data"]["logged_sets"]
    assert sets[0]["quantity"]["kind"] == "distance"
    assert sets[0]["quantity"]["metres"] == 5000
    assert sets[1]["quantity"] == reps_quantity(5)
    assert sets[1]["load"] == load_from_input("absolute", "100").to_dict()


def test_a_distance_set_contributes_nothing_to_a_strength_read_path():
    # Arrange — a distance-only run logged against an Exercise, then its RECORDS read
    client, ctx = build_client()
    headers = _auth(ctx, "user_exclude")
    running = _create_exercise(client, headers, "Running")
    body = _adhoc_body(
        running,
        logged_sets=[
            {
                "exercise_id": running,
                "quantity_kind": "distance",
                "quantity_value": "5",
                "quantity_unit": "km",
                "load_kind": "qualitative",
                "load_value": None,
            }
        ],
    )
    client.post("/api/logs", headers=headers, json=body)

    # Act — read the per-Exercise records header (Estimated 1RM / Personal Record)
    records = client.get(f"/api/exercises/{running}/records", headers=headers)

    # Assert — a run has no absolute Load and no rep count, so it strikes no Estimated
    # 1RM / Personal Record, yet the strength read path does not error on it
    assert records.status_code == 200
    data = records.json()["data"]
    assert data["personal_record"] is None
    assert data["pr_milestones"] == []
    assert data["total_sets"] == 1


def test_logging_rejects_an_empty_set_list():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_empty")
    session = _generate_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json={"performed_on": "2026-06-20", "logged_sets": []},
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False
