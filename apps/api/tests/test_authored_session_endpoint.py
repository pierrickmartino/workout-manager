"""Behavior of the Hand-Authored Session endpoint end to end (ADR-0040, issue #287):
real JWKS verification, the repositories, the authoring + logbook services, and the
response envelope wired through FastAPI. Repositories and the AI regenerator are injected
via dependency overrides so the tests run offline and deterministically.

``POST /api/sessions`` authors a standalone ``user_authored`` Session (the plan) and
records its first Logged Session (the record) in one submit — reusing the existing
``log_session`` service. The seam under test is the endpoint: given a request, assert the
persisted/returned outcome and the error contract, never internal structure."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.load import load_from_input
from app.generation.generator import GenerationRequest
from app.generation.regenerator import RegenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_enrichment_queue,
    get_exercise_repository,
    get_generation_feedback_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
    get_session_generator,
    get_session_regenerator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.protocol_repository import InMemoryProtocolRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, NullEnrichmentQueue, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5"
                )
            ]
        )


class FakeRegenerator:
    def regenerate(self, request: RegenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Goblet Squat", sets=3, reps="10"
                )
            ]
        )


def build_client(ctx=None, profiles=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    protocols = InMemoryProtocolRepository(exercises)
    feedback = InMemoryGenerationFeedbackRepository()
    profiles = profiles or InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_protocol_repository] = lambda: protocols
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_session_regenerator] = lambda: FakeRegenerator()
    app.dependency_overrides[get_generation_feedback_repository] = lambda: feedback
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    # Hand-authoring a Session resolves any brand-new movement through POST
    # /api/exercises, which now enqueues an async Enrichment job (issue #309, user
    # story 25); keep the offline harness Redis-free with a no-op queue.
    app.dependency_overrides[get_enrichment_queue] = lambda: NullEnrichmentQueue()
    client = TestClient(app)
    client.exercises = exercises
    return client, ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_exercise(client, headers, name) -> int:
    """Resolve-or-create a catalog Exercise by name (ADR-0033) and return its id."""
    return client.post(
        "/api/exercises", headers=headers, json={"name": name}
    ).json()["data"]["id"]


def _author_body(exercise_id, **overrides):
    body = {
        "performed_on": "2026-06-20",
        "training_type": "strength",
        "prescriptions": [
            {
                "exercise_id": exercise_id,
                "sets": 3,
                "reps": "5",
                "rest_seconds": 90,
                "tempo": "3-1-1",
                "load_kind": "absolute",
                "load_value": "100",
            }
        ],
        "logged_sets": [
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "5",
                "load_kind": "absolute",
                "load_value": "100",
                "perceived_difficulty": 8,
            }
        ],
    }
    body.update(overrides)
    return body


def _history(client, headers) -> list:
    return client.get("/api/logs", headers=headers).json()["data"]


def test_author_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post("/api/sessions", json=_author_body(1))

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_author_creates_user_authored_session_and_its_first_log():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_author")
    exercise_id = _create_exercise(client, headers, "Back Squat")

    # Act
    response = client.post(
        "/api/sessions", headers=headers, json=_author_body(exercise_id)
    )

    # Assert — the response is the first Logged Session, tied to a created Session.
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["session_id"] is not None
    assert data["training_type"] == "strength"
    assert data["performed_on"] == "2026-06-20"
    assert len(data["logged_sets"]) == 1

    # The created Session is a standalone user_authored plan carrying the authored shape.
    session = client.get(
        f"/api/sessions/{data['session_id']}", headers=headers
    ).json()["data"]
    assert session["provenance"] == "user_authored"
    assert len(session["prescriptions"]) == 1
    prescription = session["prescriptions"][0]
    assert prescription["sets"] == 3
    assert prescription["reps"] == "5"
    assert prescription["rest_seconds"] == 90
    assert prescription["tempo"] == "3-1-1"
    assert prescription["recommended_load"] == load_from_input("absolute", "100").to_dict()

    # And it shows up in History like any logged session.
    history = _history(client, headers)
    assert len(history) == 1
    assert history[0]["session_id"] == data["session_id"]


def test_authored_session_is_re_loggable_via_existing_log_route():
    # Arrange — author a session, then log a second performance of it.
    client, ctx = build_client()
    headers = _auth(ctx, "user_relog")
    exercise_id = _create_exercise(client, headers, "Back Squat")
    session_id = client.post(
        "/api/sessions", headers=headers, json=_author_body(exercise_id)
    ).json()["data"]["session_id"]

    # Act — re-log through the existing plan-backed route (no re-authoring).
    relog = client.post(
        f"/api/sessions/{session_id}/logs",
        headers=headers,
        json={
            "performed_on": "2026-06-27",
            "logged_sets": [
                {
                    "exercise_id": exercise_id,
                    "quantity_kind": "repetitions",
                    "quantity_value": "6",
                    "load_kind": "absolute",
                    "load_value": "105",
                }
            ],
        },
    )

    # Assert — two performances of the one authored Session now in History.
    assert relog.status_code == 200
    history = _history(client, headers)
    assert len(history) == 2
    assert {row["session_id"] for row in history} == {session_id}


def test_authored_logged_session_is_deletable_via_the_existing_route():
    # Arrange — author a session, capturing the created Logged Session's id.
    client, ctx = build_client()
    headers = _auth(ctx, "user_delete")
    exercise_id = _create_exercise(client, headers, "Back Squat")
    log_id = client.post(
        "/api/sessions", headers=headers, json=_author_body(exercise_id)
    ).json()["data"]["id"]

    # Act — delete it through the existing Log Correction route (ADR-0034).
    response = client.delete(f"/api/logs/{log_id}", headers=headers)

    # Assert — the record is gone from History.
    assert response.status_code == 200
    assert _history(client, headers) == []


def test_authored_logged_session_is_correctable_via_the_existing_route():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_correct")
    exercise_id = _create_exercise(client, headers, "Back Squat")
    log_id = client.post(
        "/api/sessions", headers=headers, json=_author_body(exercise_id)
    ).json()["data"]["id"]

    # Act — correct the recorded reps through the existing PUT route (ADR-0034).
    response = client.put(
        f"/api/logs/{log_id}",
        headers=headers,
        json={
            "performed_on": "2026-06-20",
            "logged_sets": [
                {
                    "exercise_id": exercise_id,
                    "quantity_kind": "repetitions",
                    "quantity_value": "8",
                    "load_kind": "absolute",
                    "load_value": "100",
                }
            ],
        },
    )

    # Assert — the correction took.
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["logged_sets"][0]["quantity"]["count"] == 8


def test_typed_load_and_quantity_round_trip():
    # Arrange — a bodyweight-plus load on the plan and a distance Quantity on the record.
    client, ctx = build_client()
    headers = _auth(ctx, "user_typed")
    exercise_id = _create_exercise(client, headers, "Weighted Pull-up")
    body = _author_body(
        exercise_id,
        prescriptions=[
            {
                "exercise_id": exercise_id,
                "sets": 4,
                "reps": "6",
                "load_kind": "bodyweight",
                "load_value": "20",
            }
        ],
        logged_sets=[
            {
                "exercise_id": exercise_id,
                "quantity_kind": "repetitions",
                "quantity_value": "6",
                "load_kind": "bodyweight",
                "load_value": "20",
                "perceived_difficulty": 9,
            }
        ],
    )

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert — the typed Load survives on both the plan and the record.
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["logged_sets"][0]["load"]["kind"] == "bodyweight"
    session = client.get(
        f"/api/sessions/{data['session_id']}", headers=headers
    ).json()["data"]
    assert session["prescriptions"][0]["recommended_load"]["kind"] == "bodyweight"


def test_duration_performed_set_round_trips_as_a_duration_quantity():
    # Arrange — a Dead hang held 0:45 per set, authored as a duration exercise (issue #300).
    # The plan target stays free text (ADR-0032, no schema change); the record carries a
    # typed `duration` Quantity, which the author-and-log path already accepts end to end.
    client, ctx = build_client()
    headers = _auth(ctx, "user_hold")
    exercise_id = _create_exercise(client, headers, "Dead Hang")
    body = _author_body(
        exercise_id,
        prescriptions=[
            {
                "exercise_id": exercise_id,
                "sets": 3,
                "reps": "45s",
                "load_kind": "bodyweight",
                "load_value": None,
            }
        ],
        logged_sets=[
            {
                "exercise_id": exercise_id,
                "quantity_kind": "duration",
                "quantity_value": "0:45",
                "load_kind": "bodyweight",
                "load_value": None,
                "perceived_difficulty": 7,
            }
        ],
    )

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert — the set persists as a duration Quantity canonicalised to 45 seconds, with
    # the entered text preserved verbatim...
    assert response.status_code == 200
    quantity = response.json()["data"]["logged_sets"][0]["quantity"]
    assert quantity["kind"] == "duration"
    assert quantity["seconds"] == 45
    assert quantity["text"] == "0:45"

    # ...and reads back the same way through the existing history route.
    history = _history(client, headers)
    assert history[0]["logged_sets"][0]["quantity"]["kind"] == "duration"
    assert history[0]["logged_sets"][0]["quantity"]["seconds"] == 45


def test_today_is_accepted():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_today")
    exercise_id = _create_exercise(client, headers, "Back Squat")

    # Act — performed today (the default, boundary-inclusive).
    response = client.post(
        "/api/sessions",
        headers=headers,
        json=_author_body(exercise_id, performed_on=date.today().isoformat()),
    )

    # Assert
    assert response.status_code == 200


def test_future_performed_on_is_rejected_and_persists_nothing():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_future")
    exercise_id = _create_exercise(client, headers, "Back Squat")

    # Act — a date after today.
    response = client.post(
        "/api/sessions",
        headers=headers,
        json=_author_body(exercise_id, performed_on="2099-01-01"),
    )

    # Assert — structured 422 naming the offending rule; nothing written.
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert any(error["code"] == "future_performed_on" for error in body["errors"])
    assert _history(client, headers) == []


def test_empty_session_is_rejected_and_persists_nothing():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_empty")

    # Act — no prescriptions and no performed sets.
    response = client.post(
        "/api/sessions",
        headers=headers,
        json={
            "performed_on": "2026-06-20",
            "training_type": "strength",
            "prescriptions": [],
            "logged_sets": [],
        },
    )

    # Assert — the shared deploy validator rejects an empty session.
    assert response.status_code == 422
    body = response.json()
    assert any(error["code"] == "empty_session" for error in body["errors"])
    assert _history(client, headers) == []


def test_unknown_prescription_exercise_is_rejected_and_persists_nothing():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_unknown_plan")

    # Act — the authored plan references an Exercise that is not in the catalog.
    response = client.post(
        "/api/sessions", headers=headers, json=_author_body(9999)
    )

    # Assert
    assert response.status_code == 422
    body = response.json()
    assert any(error["code"] == "unknown_exercise" for error in body["errors"])
    # No standalone Session was created (atomic): id 1 would be the first one.
    assert client.get("/api/sessions/1", headers=headers).status_code == 404
    assert _history(client, headers) == []


def test_unknown_logged_set_exercise_is_rejected_atomically():
    # Arrange — a valid plan, but a performed set referencing an unknown Exercise.
    client, ctx = build_client()
    headers = _auth(ctx, "user_unknown_log")
    exercise_id = _create_exercise(client, headers, "Back Squat")
    body = _author_body(exercise_id)
    body["logged_sets"][0]["exercise_id"] = 9999

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert — rejected before any write, so no orphan Session and no record.
    assert response.status_code == 422
    body = response.json()
    assert any(error["code"] == "unknown_exercise" for error in body["errors"])
    assert client.get("/api/sessions/1", headers=headers).status_code == 404
    assert _history(client, headers) == []


def _grouped_prescription(exercise_id, *, group, round_rest, sets=3):
    """One authored Prescription carrying Superset grouping (ADR-0023)."""
    return {
        "exercise_id": exercise_id,
        "sets": sets,
        "reps": "5",
        "rest_seconds": 90,
        "load_kind": "absolute",
        "load_value": "100",
        "superset_group": group,
        "round_rest_seconds": round_rest,
    }


def _solo_prescription(exercise_id, sets=3):
    return {
        "exercise_id": exercise_id,
        "sets": sets,
        "reps": "5",
        "rest_seconds": 90,
        "load_kind": "absolute",
        "load_value": "100",
    }


def test_author_persists_a_superset_and_renders_it_on_the_session_detail():
    # Arrange — two consecutive exercises grouped into a Superset with a round-rest.
    client, ctx = build_client()
    headers = _auth(ctx, "user_superset")
    squat = _create_exercise(client, headers, "Back Squat")
    press = _create_exercise(client, headers, "Overhead Press")
    body = _author_body(
        squat,
        prescriptions=[
            _grouped_prescription(squat, group="1", round_rest=120),
            _grouped_prescription(press, group="1", round_rest=120),
        ],
    )

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert — the Superset persists on the authored plan and reads back on its detail.
    assert response.status_code == 200
    data = response.json()["data"]
    session = client.get(
        f"/api/sessions/{data['session_id']}", headers=headers
    ).json()["data"]
    prescriptions = session["prescriptions"]
    assert len(prescriptions) == 2
    assert [p["superset_group"] for p in prescriptions] == ["1", "1"]
    assert [p["round_rest_seconds"] for p in prescriptions] == [120, 120]

    # The Logged Session record stays sets-only — no plan overlay leaks onto the record.
    for logged_set in data["logged_sets"]:
        assert "superset_group" not in logged_set
        assert "round_rest_seconds" not in logged_set


def test_non_contiguous_superset_is_rejected_and_persists_nothing():
    # Arrange — a group tag split by a solo Exercise sitting between its members.
    client, ctx = build_client()
    headers = _auth(ctx, "user_split")
    squat = _create_exercise(client, headers, "Back Squat")
    press = _create_exercise(client, headers, "Overhead Press")
    row = _create_exercise(client, headers, "Barbell Row")
    body = _author_body(
        squat,
        prescriptions=[
            _grouped_prescription(squat, group="1", round_rest=120),
            _solo_prescription(press),
            _grouped_prescription(row, group="1", round_rest=120),
        ],
    )

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert — the shared validator rejects the split group; nothing is written.
    assert response.status_code == 422
    body = response.json()
    assert any(e["code"] == "superset_non_contiguous" for e in body["errors"])
    assert client.get("/api/sessions/1", headers=headers).status_code == 404
    assert _history(client, headers) == []


def test_singleton_superset_is_rejected_and_persists_nothing():
    # Arrange — a lone Prescription carrying a group tag (a Superset needs 2+).
    client, ctx = build_client()
    headers = _auth(ctx, "user_singleton")
    squat = _create_exercise(client, headers, "Back Squat")
    body = _author_body(
        squat,
        prescriptions=[_grouped_prescription(squat, group="1", round_rest=120)],
    )

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert
    assert response.status_code == 422
    body = response.json()
    assert any(e["code"] == "superset_lone_member" for e in body["errors"])
    assert client.get("/api/sessions/1", headers=headers).status_code == 404
    assert _history(client, headers) == []


def test_superset_is_suppressed_for_a_sensitive_constraint_user():
    # Arrange — a user carrying a Sensitive Constraint (injury) authors a structurally
    # valid Superset. Supersets compress rest and raise intensity, so they are hard-blocked
    # at the shared validator seam no matter who placed them (ADR-0023).
    profiles = InMemoryProfileRepository()
    profiles.update("user_injured", ProfileUpdate(sensitive_constraints=["injury"]))
    client, ctx = build_client(profiles=profiles)
    headers = _auth(ctx, "user_injured")
    squat = _create_exercise(client, headers, "Back Squat")
    press = _create_exercise(client, headers, "Overhead Press")
    body = _author_body(
        squat,
        prescriptions=[
            _grouped_prescription(squat, group="1", round_rest=120),
            _grouped_prescription(press, group="1", round_rest=120),
        ],
    )

    # Act
    response = client.post("/api/sessions", headers=headers, json=body)

    # Assert
    assert response.status_code == 422
    body = response.json()
    assert any(
        e["code"] == "superset_forbidden_under_sensitive_constraint"
        for e in body["errors"]
    )
    assert _history(client, headers) == []


def test_generation_feedback_is_rejected_on_a_hand_authored_session():
    # Arrange — a user_authored session.
    client, ctx = build_client()
    headers = _auth(ctx, "user_feedback")
    exercise_id = _create_exercise(client, headers, "Back Squat")
    session_id = client.post(
        "/api/sessions", headers=headers, json=_author_body(exercise_id)
    ).json()["data"]["session_id"]

    # Act — offer "the AI gave me a bad plan" on a plan the user wrote by hand.
    response = client.post(
        f"/api/sessions/{session_id}/feedback",
        headers=headers,
        json={"verdict": "negative", "reason": "too hard"},
    )

    # Assert
    assert response.status_code == 409


def test_regeneration_is_rejected_on_a_hand_authored_session():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_regen")
    exercise_id = _create_exercise(client, headers, "Back Squat")
    session_id = client.post(
        "/api/sessions", headers=headers, json=_author_body(exercise_id)
    ).json()["data"]["session_id"]

    # Act — ask the AI to redo a plan it never wrote.
    response = client.post(
        f"/api/sessions/{session_id}/regenerate",
        headers=headers,
        json={"keep": []},
    )

    # Assert
    assert response.status_code == 409
