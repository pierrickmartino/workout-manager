"""The Session rename endpoint end to end: real JWKS verification, the repositories,
and the response envelope wired through FastAPI.

``PUT /api/sessions/{id}/name`` sets, edits, or clears the owner's **Session Name**
(issue #394) — a *plan* edit that never touches a Logged Session (ADR-0001). An
unnamed Session reads back a derived ``training_type · date`` fallback so it is never
blank. Offered on standalone Sessions only: a Protocol member is ``409``. ``404`` for
anyone who does not own the Session. Repositories and the generator are injected via
dependency overrides so the tests run offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.db.models import WorkoutSession
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
                    exercise_name="Back Squat", sets=5, reps="5", rest_seconds=120
                ),
            ]
        )


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    client = TestClient(app)
    client.sessions = sessions
    return client, ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def test_rename_requires_authentication():
    client, _ = build_client()
    response = client.put("/api/sessions/1/name", json={"name": "Leg Day"})
    assert response.status_code == 401


def test_generated_session_is_born_unnamed_with_a_derived_fallback():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_named")

    # Act — a freshly generated Session carries no name
    source = _create_session(client, headers)

    # Assert — name is null, and the read falls back to training_type · creation date
    assert source["name"] is None
    assert source["display_name"].startswith("strength · ")


def test_setting_a_name_reads_it_back():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_named")
    source = _create_session(client, headers)

    # Act
    response = client.put(
        f"/api/sessions/{source['id']}/name",
        headers=headers,
        json={"name": "Leg Day A"},
    )

    # Assert — the Session Name is stored and becomes the display label
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["name"] == "Leg Day A"
    assert body["data"]["display_name"] == "Leg Day A"

    # And it persists on a subsequent read
    read = client.get(f"/api/sessions/{source['id']}", headers=headers).json()["data"]
    assert read["name"] == "Leg Day A"


def test_a_name_is_trimmed_before_storing():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_named")
    source = _create_session(client, headers)

    # Act
    response = client.put(
        f"/api/sessions/{source['id']}/name",
        headers=headers,
        json={"name": "  Push Day  "},
    )

    # Assert — surrounding whitespace never reaches the stored name
    assert response.json()["data"]["name"] == "Push Day"


def test_clearing_a_name_falls_back_to_the_derived_label():
    # Arrange — a Session that has been named
    client, ctx = build_client()
    headers = _auth(ctx, "user_named")
    source = _create_session(client, headers)
    client.put(
        f"/api/sessions/{source['id']}/name", headers=headers, json={"name": "Leg Day"}
    )

    # Act — an empty/whitespace name clears it back to born-unnamed
    response = client.put(
        f"/api/sessions/{source['id']}/name", headers=headers, json={"name": "   "}
    )

    # Assert — name is null again and the derived fallback returns
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] is None
    assert data["display_name"].startswith("strength · ")


def test_rename_leaves_logged_sessions_untouched():
    # Arrange — a Session with one performed Logged Session (the record)
    client, ctx = build_client()
    headers = _auth(ctx, "user_record")
    source = _create_session(client, headers)
    exercise_id = source["prescriptions"][0]["exercise_id"]
    log_body = {
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
    logged = client.post(
        f"/api/sessions/{source['id']}/logs", headers=headers, json=log_body
    ).json()["data"]

    # Act — rename the plan
    client.put(
        f"/api/sessions/{source['id']}/name", headers=headers, json={"name": "Leg Day"}
    )

    # Assert — the settled record is byte-for-byte the same (plan/record separation)
    after = client.get(f"/api/logs/{logged['id']}", headers=headers).json()["data"]
    assert after == logged


def test_rename_is_rejected_on_a_protocol_member():
    # Arrange — a Protocol-member Session owned by the caller, seeded directly (the API
    # only ever builds standalone Sessions). Session Name is standalone-only (CONTEXT),
    # so rename must refuse a Protocol member at the boundary.
    client, ctx = build_client()
    headers = _auth(ctx, "proto_owner")
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
    client.sessions._prescriptions[member.id] = []
    client.sessions._next_id = 2

    # Act
    response = client.put(
        f"/api/sessions/{member.id}/name", headers=headers, json={"name": "Nope"}
    )

    # Assert — 409, and the Session is left unnamed
    assert response.status_code == 409
    assert member.name is None


def test_rename_404s_for_another_users_session():
    # Arrange — a non-owner can never rename another user's plan
    client, ctx = build_client()
    source = _create_session(client, _auth(ctx, "user_owner"))

    # Act
    response = client.put(
        f"/api/sessions/{source['id']}/name",
        headers=_auth(ctx, "user_intruder"),
        json={"name": "Mine now"},
    )

    # Assert
    assert response.status_code == 404


def test_rename_404s_for_an_unknown_session():
    client, ctx = build_client()
    response = client.put(
        "/api/sessions/424242/name",
        headers=_auth(ctx, "user_any"),
        json={"name": "Ghost"},
    )
    assert response.status_code == 404
