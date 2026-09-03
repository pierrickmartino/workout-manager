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
    get_enrichment_queue,
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.protocol_repository import InMemoryProtocolRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, NullEnrichmentQueue, make_signing_context


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
    protocols = InMemoryProtocolRepository(exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_protocol_repository] = lambda: protocols
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: InMemoryProfileRepository()
    # The picker's create-on-miss (POST /api/exercises) now enqueues an async
    # Enrichment job (issue #309); keep the offline harness Redis-free with a no-op.
    app.dependency_overrides[get_enrichment_queue] = lambda: NullEnrichmentQueue()
    client = TestClient(app)
    # Exposed so a test can seed a Protocol + performed history directly, without
    # driving the heavier generation endpoints, to exercise the contiguity 409.
    client.exercises = exercises
    client.logged = logged
    client.protocols = protocols
    # Exposed so a test can seed a Protocol-member Session directly (``create`` only
    # builds standalone ones) to exercise Insert's standalone-only 422 at the boundary.
    client.sessions = sessions
    return client, ctx


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


def test_logging_effort_in_rir_echoes_the_typed_value_and_mirrors_rpe():
    # Arrange — a set logged with effort in the RIR scale (ADR-0066)
    client, ctx = build_client()
    headers = _auth(ctx, "user_effort_rir")
    session = _generate_session(client, headers)
    body = _log_body(
        session,
        logged_sets=[
            {
                "exercise_id": session["prescriptions"][0]["exercise_id"],
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "70",
                "effort_scale": "rir",
                "effort_value": 3,
            }
        ],
    )

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — the typed Effort is echoed in the scale it was logged…
    assert logged.status_code == 200
    logged_set = logged.json()["data"]["logged_sets"][0]
    assert logged_set["effort"] == {"scale": "rir", "value": 3}
    # …and the dual-write mirrors its RPE-equivalent (10 − 3 = 7) into the legacy int
    assert logged_set["perceived_difficulty"] == 7


def test_logging_effort_in_rpe_stores_a_half_step_typed_value():
    # Arrange — a half-step RPE, a resolution the legacy int cannot hold
    client, ctx = build_client()
    headers = _auth(ctx, "user_effort_rpe")
    session = _generate_session(client, headers)
    body = _log_body(
        session,
        logged_sets=[
            {
                "exercise_id": session["prescriptions"][0]["exercise_id"],
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "70",
                "effort_scale": "rpe",
                "effort_value": 6.5,
            }
        ],
    )

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — the half-step survives on the typed value; the mirror rounds to an int
    assert logged.status_code == 200
    logged_set = logged.json()["data"]["logged_sets"][0]
    assert logged_set["effort"] == {"scale": "rpe", "value": 6.5}
    assert logged_set["perceived_difficulty"] in (6, 7)


def test_an_out_of_range_effort_is_rejected_at_the_boundary():
    # Arrange — RIR 2.5 is not a valid member (RIR is an integer 0–5)
    client, ctx = build_client()
    headers = _auth(ctx, "user_effort_bad")
    session = _generate_session(client, headers)
    body = _log_body(
        session,
        logged_sets=[
            {
                "exercise_id": session["prescriptions"][0]["exercise_id"],
                "quantity_value": "5",
                "effort_scale": "rir",
                "effort_value": 2.5,
            }
        ],
    )

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — a boundary rejection, never a stored guess
    assert logged.status_code == 422
    assert logged.json()["success"] is False


def test_an_unknown_effort_scale_is_rejected_at_the_boundary():
    # Arrange — a scale outside the closed RPE/RIR vocabulary
    client, ctx = build_client()
    headers = _auth(ctx, "user_effort_scale")
    session = _generate_session(client, headers)
    body = _log_body(
        session,
        logged_sets=[
            {
                "exercise_id": session["prescriptions"][0]["exercise_id"],
                "quantity_value": "5",
                "effort_scale": "borg",
                "effort_value": 15,
            }
        ],
    )

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert
    assert logged.status_code == 422


def test_a_returning_users_legacy_effort_still_serializes_with_no_typed_effort():
    # Arrange — an rpe-only client sends only perceived_difficulty (no effort fields)
    client, ctx = build_client()
    headers = _auth(ctx, "user_effort_legacy")
    session = _generate_session(client, headers)

    # Act
    logged = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — the legacy int rides through; no typed Effort is fabricated
    assert logged.status_code == 200
    logged_set = logged.json()["data"]["logged_sets"][0]
    assert logged_set["perceived_difficulty"] == 8
    assert logged_set["effort"] is None


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


# --- Idempotent finish (ADR-0060, issue #410) ---------------------------------------


def test_repeating_a_finish_key_returns_one_logged_session():
    # Arrange — a finish carrying a client-minted idempotency key
    client, ctx = build_client()
    headers = _auth(ctx, "user_idem")
    session = _generate_session(client, headers)
    body = _log_body(session, idempotency_key="finish-key-1")

    # Act — the same finish is delivered twice (a dropped connection, then a retry)
    first = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )
    second = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=body
    )

    # Assert — both calls succeed and return the same record; history holds exactly one
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["id"] == first.json()["data"]["id"]
    history = client.get("/api/logs", headers=headers).json()["data"]
    assert len(history) == 1


def test_distinct_finish_keys_create_two_logged_sessions():
    # Arrange — two genuinely different finishes, each with its own key
    client, ctx = build_client()
    headers = _auth(ctx, "user_idem_distinct")
    session = _generate_session(client, headers)

    # Act
    first = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, idempotency_key="finish-key-a"),
    )
    second = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, idempotency_key="finish-key-b"),
    )

    # Assert — distinct keys are distinct records
    assert first.json()["data"]["id"] != second.json()["data"]["id"]
    assert len(client.get("/api/logs", headers=headers).json()["data"]) == 2


def test_a_finish_without_a_key_still_records():
    # Arrange — a keyless finish (the static form path) is unaffected
    client, ctx = build_client()
    headers = _auth(ctx, "user_idem_keyless")
    session = _generate_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    )

    # Assert — one insert, as before idempotency existed
    assert response.status_code == 200
    assert len(client.get("/api/logs", headers=headers).json()["data"]) == 1


def test_repeating_an_ad_hoc_finish_key_returns_one_logged_session():
    # Arrange — the ad-hoc (plan-less) path is as duplicate-proof as the plan-backed one
    client, ctx = build_client()
    headers = _auth(ctx, "user_idem_adhoc")
    running = _create_exercise(client, headers, "Running")
    body = _adhoc_body(running, idempotency_key="adhoc-key-1")

    # Act — the same ad-hoc finish, delivered twice
    first = client.post("/api/logs", headers=headers, json=body)
    second = client.post("/api/logs", headers=headers, json=body)

    # Assert — identical behaviour to the plan-backed route: one record, returned twice
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["data"]["id"] == first.json()["data"]["id"]
    assert len(client.get("/api/logs", headers=headers).json()["data"]) == 1


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


def test_plan_less_log_records_a_hold_as_a_duration_set():
    # Arrange — a 90-second plank and a 5-minute hold logged plan-less as duration sets
    client, ctx = build_client()
    headers = _auth(ctx, "user_holds")
    plank = _create_exercise(client, headers, "Plank")
    body = _adhoc_body(
        plank,
        training_type="mobility",
        logged_sets=[
            {
                "exercise_id": plank,
                "quantity_kind": "duration",
                "quantity_value": "90",
                "load_kind": "bodyweight",
                "load_value": "0",
            },
            {
                "exercise_id": plank,
                "quantity_kind": "duration",
                "quantity_value": "5:00",
                "load_kind": "bodyweight",
                "load_value": "0",
            },
        ],
    )

    # Act
    logged = client.post("/api/logs", headers=headers, json=body)
    history = client.get("/api/logs", headers=headers)

    # Assert — each hold is stored canonically in seconds with its text kept verbatim,
    # and both round-trip in history exactly as entered
    assert logged.status_code == 200
    sets = logged.json()["data"]["logged_sets"]
    assert sets[0]["quantity"] == quantity_from_input("duration", "90").to_dict()
    assert sets[0]["quantity"]["seconds"] == 90
    assert sets[0]["quantity"]["text"] == "90"
    assert sets[1]["quantity"]["seconds"] == 300
    assert sets[1]["quantity"]["text"] == "5:00"
    assert history.json()["data"][0]["logged_sets"] == sets


def test_plan_less_log_records_a_distance_unknown_treadmill_session():
    # Arrange — 45 minutes of zone-2 on a treadmill, distance unknown: a pure duration set
    client, ctx = build_client()
    headers = _auth(ctx, "user_treadmill")
    treadmill = _create_exercise(client, headers, "Treadmill")
    body = _adhoc_body(
        treadmill,
        logged_sets=[
            {
                "exercise_id": treadmill,
                "quantity_kind": "duration",
                "quantity_value": "45:00",
                "load_kind": "qualitative",
                "load_value": None,
            }
        ],
    )

    # Act
    logged = client.post("/api/logs", headers=headers, json=body)

    # Assert — no distance is required; the effort records purely as canonical seconds,
    # carrying no metres and therefore no derivable pace
    assert logged.status_code == 200
    quantity = logged.json()["data"]["logged_sets"][0]["quantity"]
    assert quantity["kind"] == "duration"
    assert quantity["seconds"] == 2700
    assert quantity["text"] == "45:00"
    assert "metres" not in quantity


def test_a_duration_set_contributes_nothing_to_a_strength_read_path():
    # Arrange — a duration-only hold logged against an Exercise, then its RECORDS read
    client, ctx = build_client()
    headers = _auth(ctx, "user_exclude_duration")
    plank = _create_exercise(client, headers, "Plank")
    body = _adhoc_body(
        plank,
        training_type="mobility",
        logged_sets=[
            {
                "exercise_id": plank,
                "quantity_kind": "duration",
                "quantity_value": "5:00",
                "load_kind": "bodyweight",
                "load_value": "0",
            }
        ],
    )
    client.post("/api/logs", headers=headers, json=body)

    # Act — read the per-Exercise records header (Estimated 1RM / Personal Record)
    records = client.get(f"/api/exercises/{plank}/records", headers=headers)

    # Assert — a hold has no rep count and no absolute Load, so it strikes no Estimated
    # 1RM / Personal Record and adds no tonnage, yet the strength read path does not error
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


def _correction_body(exercise_id, **overrides):
    """A PUT body correcting a Logged Session's contents (ADR-0034)."""
    body = {
        "performed_on": "2026-07-01",
        "duration_seconds": 1500,
        "logged_sets": [
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "6",
                "load_kind": "absolute",
                "load_value": "72",
                "perceived_difficulty": 7,
            }
        ],
    }
    body.update(overrides)
    return body


def test_correcting_a_log_updates_it_and_preserves_the_outcome():
    # Arrange — log a plan-backed performance the client declared Completed
    client, ctx = build_client()
    headers = _auth(ctx, "user_correct")
    session = _generate_session(client, headers)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    created = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, completion_outcome="completed"),
    ).json()["data"]

    # Act — correct its contents through PUT /api/logs/{id}
    response = client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json=_correction_body(exercise_id),
    )

    # Assert — the record is updated in place; the outcome and Session are preserved
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == created["id"]
    assert data["session_id"] == session["id"]
    assert data["performed_on"] == "2026-07-01"
    assert data["duration_seconds"] == 1500
    assert data["completion_outcome"] == "completed"
    assert data["logged_sets"][0]["quantity"] == reps_quantity(6)
    assert data["logged_sets"][0]["load"] == load_from_input("absolute", "72").to_dict()


def test_correcting_a_log_you_do_not_own_is_not_found():
    # Arrange — user_owner logs a performance
    client, ctx = build_client()
    owner = _auth(ctx, "user_owner")
    session = _generate_session(client, owner)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=owner, json=_log_body(session)
    ).json()["data"]

    # Act — a different user tries to correct it
    stranger = _auth(ctx, "user_stranger")
    response = client.put(
        f"/api/logs/{created['id']}", headers=stranger, json=_correction_body(exercise_id)
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_correcting_a_log_with_an_unknown_exercise_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_bad_exercise")
    session = _generate_session(client, headers)
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    ).json()["data"]

    # Act — a set naming an Exercise not in the catalog
    response = client.put(
        f"/api/logs/{created['id']}", headers=headers, json=_correction_body(9999)
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_correcting_a_plan_less_log_without_a_training_type_is_rejected():
    # Arrange — an ad-hoc, plan-less record (ADR-0031)
    client, ctx = build_client()
    headers = _auth(ctx, "user_adhoc_correct")
    running = _create_exercise(client, headers, "Running")
    created = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(running)
    ).json()["data"]

    # Act — correct it but blank out the training type (boundary-rule violation)
    response = client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json=_correction_body(running, training_type="   "),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_correcting_a_plan_less_log_can_change_its_training_type():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_adhoc_retype")
    running = _create_exercise(client, headers, "Running")
    created = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(running)
    ).json()["data"]

    # Act
    response = client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json=_correction_body(running, training_type="mobility"),
    )

    # Assert — the plan-less record takes the request's training type
    assert response.status_code == 200
    assert response.json()["data"]["training_type"] == "mobility"


def test_correcting_a_log_with_zero_sets_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_zero_sets")
    session = _generate_session(client, headers)
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    ).json()["data"]

    # Act — a session always keeps at least one set
    response = client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json={"performed_on": "2026-07-01", "logged_sets": []},
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_correction_recomputes_personal_record_on_the_next_read():
    # Arrange — log a light single, note the Personal Record it projects
    client, ctx = build_client()
    headers = _auth(ctx, "user_pr_recompute")
    session = _generate_session(client, headers)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    created = client.post(
        f"/api/sessions/{session['id']}/logs",
        headers=headers,
        json=_log_body(session, logged_sets=[
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "60",
            }
        ]),
    ).json()["data"]
    before = client.get(
        f"/api/exercises/{exercise_id}/records", headers=headers
    ).json()["data"]["personal_record"]

    # Act — correct the load far heavier
    client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json=_correction_body(exercise_id, logged_sets=[
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "120",
            }
        ]),
    )
    after = client.get(
        f"/api/exercises/{exercise_id}/records", headers=headers
    ).json()["data"]["personal_record"]

    # Assert — the read-time projection reflects the corrected record (ADR-0034):
    # `personal_record` is the highest Estimated 1RM in kg, which rises with the load.
    assert after is not None
    assert before is not None
    assert after > before


# --- PUT /api/logs/{id} Completion Outcome correction (ADR-0034) --------------------


def test_correcting_a_plan_backed_log_to_incomplete_moves_the_next_session_back():
    # Arrange — seed a two-Session Protocol, perform its first Session (Completed).
    # Next Session is the second, and one Session is complete.
    client, ctx = build_client()
    headers = _auth(ctx, "user_uncomplete")
    protocol, squat = _seed_protocol(client, "user_uncomplete")
    first = _perform_protocol_session(client, "user_uncomplete", protocol, 0, squat)
    before = client.get(f"/api/protocols/{protocol.id}", headers=headers).json()["data"]
    assert before["next_session"]["session_id"] == protocol.sessions[1].session_id
    assert before["completed_count"] == 1

    # Act — correct that last-performed log to Incomplete (permitted, no later performed)
    response = client.put(
        f"/api/logs/{first.id}",
        headers=headers,
        json=_correction_body(squat.id, completion_outcome="incomplete"),
    )

    # Assert — 200 with the flipped outcome; advancement recomputes read-time: Session 1
    # is Next again and the completed count drops to zero (ADR-0034)
    assert response.status_code == 200
    assert response.json()["data"]["completion_outcome"] == "incomplete"
    after = client.get(f"/api/protocols/{protocol.id}", headers=headers).json()["data"]
    assert after["next_session"]["session_id"] == protocol.sessions[0].session_id
    assert after["completed_count"] == 0


def test_correcting_a_mid_protocol_log_to_incomplete_is_conflict():
    # Arrange — perform both Sessions of a two-Session Protocol (contiguous prefix)
    client, ctx = build_client()
    headers = _auth(ctx, "user_uncomplete_conflict")
    protocol, squat = _seed_protocol(client, "user_uncomplete_conflict")
    first = _perform_protocol_session(client, "user_uncomplete_conflict", protocol, 0, squat)
    _perform_protocol_session(client, "user_uncomplete_conflict", protocol, 1, squat)

    # Act — try to un-complete the mid-Protocol (first) performance
    response = client.put(
        f"/api/logs/{first.id}",
        headers=headers,
        json=_correction_body(squat.id, completion_outcome="incomplete"),
    )

    # Assert — refused with 409 and a tail-first message; the outcome is untouched
    assert response.status_code == 409
    body = response.json()
    assert body["success"] is False
    assert body["error"]
    assert client.logged.get(first.id, "user_uncomplete_conflict").completion_outcome == "completed"


def test_correcting_a_log_from_incomplete_to_completed_succeeds():
    # Arrange — a mid-Protocol Session logged Incomplete while a later one is Completed
    client, ctx = build_client()
    headers = _auth(ctx, "user_fill")
    protocol, squat = _seed_protocol(client, "user_fill")
    first = _perform_protocol_session(client, "user_fill", protocol, 0, squat)
    # Make the first Incomplete directly, then perform the second Completed
    client.logged.update(
        first.id,
        "user_fill",
        _incomplete_draft(protocol, squat, 0),
    )
    _perform_protocol_session(client, "user_fill", protocol, 1, squat)

    # Act — mark the first Completed (the fill direction only adds to the performed set)
    response = client.put(
        f"/api/logs/{first.id}",
        headers=headers,
        json=_correction_body(squat.id, completion_outcome="completed"),
    )

    # Assert — 200; the fill is never gated
    assert response.status_code == 200
    assert response.json()["data"]["completion_outcome"] == "completed"


def test_correcting_a_plan_less_log_supplying_an_outcome_is_rejected():
    # Arrange — an ad-hoc, plan-less record (ADR-0031): it gates no Protocol
    client, ctx = build_client()
    headers = _auth(ctx, "user_adhoc_outcome")
    running = _create_exercise(client, headers, "Running")
    created = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(running)
    ).json()["data"]

    # Act — a Completion Outcome has no place on a plan-less correction (boundary rule)
    response = client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json=_correction_body(running, training_type="cardio", completion_outcome="incomplete"),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_correcting_a_log_with_an_unknown_outcome_is_rejected():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_bad_correct_outcome")
    session = _generate_session(client, headers)
    exercise_id = session["prescriptions"][0]["exercise_id"]
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    ).json()["data"]

    # Act — "failed" is not a domain outcome (ADR-0013 rejects the collision term)
    response = client.put(
        f"/api/logs/{created['id']}",
        headers=headers,
        json=_correction_body(exercise_id, completion_outcome="failed"),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def _incomplete_draft(protocol, squat, index):
    """A LoggedSessionDraft re-declaring the Protocol's Session at ``index`` as Incomplete."""
    from datetime import date

    from app.repositories.logged_session_repository import (
        LoggedSessionDraft,
        LoggedSetDraft,
    )

    return LoggedSessionDraft(
        session_id=protocol.sessions[index].session_id,
        training_type="strength",
        performed_on=date(2026, 6, 20 + index),
        completion_outcome="incomplete",
        logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
    )


# --- DELETE /api/logs/{id} (ADR-0034, contiguity gate) ------------------------------


def _seed_protocol(client, owner: str):
    """Seed a two-Session Protocol owned by ``owner`` directly into the in-memory repos
    and return (protocol_view, squat_exercise)."""
    from app.domain.exercise import Provenance
    from app.repositories.protocol_repository import (
        ProtocolDraft,
        ProtocolSessionDraft,
    )
    from app.repositories.session_repository import PrescriptionDraft

    squat = client.exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED
    )
    protocol = client.protocols.create(
        owner,
        ProtocolDraft(
            training_type="strength",
            objective="build",
            sessions_per_week=2,
            weeks=1,
            duration_minutes=45,
            sessions=[
                ProtocolSessionDraft(
                    week=1,
                    day=day,
                    prescriptions=[
                        PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")
                    ],
                )
                for day in (1, 2)
            ],
        ),
    )
    return protocol, squat


def _perform_protocol_session(client, owner, protocol, index, squat):
    from datetime import date

    from app.repositories.logged_session_repository import (
        LoggedSessionDraft,
        LoggedSetDraft,
    )

    return client.logged.create(
        owner,
        LoggedSessionDraft(
            session_id=protocol.sessions[index].session_id,
            training_type="strength",
            performed_on=date(2026, 6, 20 + index),
            completion_outcome="completed",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id, quantity=reps_quantity(5))],
        ),
    )


def test_deleting_a_log_removes_it_and_returns_the_envelope():
    # Arrange — a standalone logged performance
    client, ctx = build_client()
    headers = _auth(ctx, "user_delete")
    session = _generate_session(client, headers)
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=headers, json=_log_body(session)
    ).json()["data"]

    # Act
    response = client.delete(f"/api/logs/{created['id']}", headers=headers)

    # Assert — 200 envelope, and it is gone from history
    assert response.status_code == 200
    assert response.json()["success"] is True
    history = client.get("/api/logs", headers=headers).json()["data"]
    assert history == []


def test_deleting_a_log_you_do_not_own_is_not_found():
    # Arrange — user_owner logs a performance
    client, ctx = build_client()
    owner = _auth(ctx, "user_owner")
    session = _generate_session(client, owner)
    created = client.post(
        f"/api/sessions/{session['id']}/logs", headers=owner, json=_log_body(session)
    ).json()["data"]

    # Act — a stranger tries to delete it
    response = client.delete(
        f"/api/logs/{created['id']}", headers=_auth(ctx, "user_stranger")
    )

    # Assert — 404, and the owner's record is untouched
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert len(client.get("/api/logs", headers=owner).json()["data"]) == 1


def test_deleting_a_mid_protocol_session_with_a_later_performed_one_is_conflict():
    # Arrange — seed a two-Session Protocol and perform both (contiguous prefix)
    client, ctx = build_client()
    headers = _auth(ctx, "user_contig")
    protocol, squat = _seed_protocol(client, "user_contig")
    first = _perform_protocol_session(client, "user_contig", protocol, 0, squat)
    _perform_protocol_session(client, "user_contig", protocol, 1, squat)

    # Act — try to delete the mid-Protocol (first) performance
    response = client.delete(f"/api/logs/{first.id}", headers=headers)

    # Assert — refused with 409 and a tail-first message; the record survives
    assert response.status_code == 409
    body = response.json()
    assert body["success"] is False
    assert body["error"]
    assert client.logged.get(first.id, "user_contig") is not None


def test_deleting_a_plan_backed_log_re_surfaces_it_as_the_next_session():
    # Arrange — seed a Protocol, perform its first Session; Next Session is the second
    client, ctx = build_client()
    headers = _auth(ctx, "user_next")
    protocol, squat = _seed_protocol(client, "user_next")
    first = _perform_protocol_session(client, "user_next", protocol, 0, squat)
    before = client.get(f"/api/protocols/{protocol.id}", headers=headers).json()["data"]
    assert before["next_session"]["session_id"] == protocol.sessions[1].session_id

    # Act — delete the first performance (last-performed, so permitted)
    response = client.delete(f"/api/logs/{first.id}", headers=headers)

    # Assert — the read-time projection recomputes: Session 1 is Next again (ADR-0034)
    assert response.status_code == 200
    after = client.get(f"/api/protocols/{protocol.id}", headers=headers).json()["data"]
    assert after["next_session"]["session_id"] == protocol.sessions[0].session_id
    assert after["completed_count"] == 0


def test_deleting_a_log_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.delete("/api/logs/1")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_history_flags_a_mid_protocol_record_as_not_deletable():
    # Arrange — a two-Session Protocol with both Sessions performed (a contiguous prefix).
    # The mid-Protocol record cannot be deleted (a later Session is performed), while the
    # last-performed one can — the same verdict the server's contiguity gate would return
    # on a DELETE, surfaced on the read so the History screen can disable the control
    # before the user clicks it (ADR-0034, user story 27).
    client, ctx = build_client()
    headers = _auth(ctx, "user_flags")
    protocol, squat = _seed_protocol(client, "user_flags")
    first = _perform_protocol_session(client, "user_flags", protocol, 0, squat)
    second = _perform_protocol_session(client, "user_flags", protocol, 1, squat)

    # Act
    history = client.get("/api/logs", headers=headers).json()["data"]
    by_id = {record["id"]: record for record in history}

    # Assert — the mid-Protocol record is refused; the tail one is allowed. The verdict
    # matches what an actual DELETE returns (409 vs 200).
    assert by_id[first.id]["deletable"] is False
    assert by_id[first.id]["uncompletable"] is False
    assert by_id[second.id]["deletable"] is True
    assert by_id[second.id]["uncompletable"] is True
    assert (
        client.delete(f"/api/logs/{first.id}", headers=headers).status_code == 409
    )
    assert (
        client.delete(f"/api/logs/{second.id}", headers=headers).status_code == 200
    )


def test_history_flags_a_plan_less_record_as_freely_correctable():
    # Arrange — an ad-hoc (plan-less) record gates no Protocol, so it is always correctable.
    client, ctx = build_client()
    headers = _auth(ctx, "user_flags_adhoc")
    running = _create_exercise(client, headers, "Running")
    created = client.post(
        "/api/logs", headers=headers, json=_adhoc_body(running)
    ).json()["data"]

    # Act
    history = client.get("/api/logs", headers=headers).json()["data"]

    # Assert
    record = next(r for r in history if r["id"] == created["id"])
    assert record["deletable"] is True
    assert record["uncompletable"] is True
