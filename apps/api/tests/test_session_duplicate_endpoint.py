"""The Duplicate endpoint end to end: real JWKS verification, the repositories,
and the response envelope wired through FastAPI.

``POST /api/sessions/{id}/duplicate`` deep-copies the owner's Session into a new
standalone Session (ADR-0043) — a reusable plan with the source's prescriptions,
Supersets, Provenance, and lineage, but no records and no Protocol position.
``404`` for anyone who does not own the source. Repositories and the generator
are injected via dependency overrides so the tests run offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5", rest_seconds=120
                ),
                GeneratedExercisePrescription(
                    exercise_name="Overhead Press", sets=3, reps="8-12"
                ),
            ]
        )


def build_client(profiles=None):
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    profiles = profiles or InMemoryProfileRepository()
    # Wire the shared profile store into the session repo so the read resolves the Author's
    # display name (CONTEXT: Author, #395).
    sessions = InMemorySessionRepository(exercises, profiles)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def test_duplicate_requires_authentication():
    client, _ = build_client()
    response = client.post("/api/sessions/1/duplicate")
    assert response.status_code == 401


def test_duplicate_creates_a_new_standalone_copy():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_dup")
    source = _create_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=headers
    )

    # Assert — a distinct Session with the same prescriptions, standalone
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    copy = body["data"]
    assert copy["id"] != source["id"]
    assert copy["clerk_user_id"] == "user_dup"
    assert [p["exercise_name"] for p in copy["prescriptions"]] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert copy["has_been_regenerated"] is False


class FakeRunGenerator:
    """Emits a running prescription so the source Session carries a typed *distance*
    Prescribed Quantity to prove Duplicate carries the kind forward faithfully (#345)."""

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Easy Run", sets=1, reps="7 KM"
                ),
            ]
        )


def test_duplicate_carries_the_prescribed_quantity_kind_forward():
    # Arrange — a source running Session whose prescription is a typed distance.
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_session_generator] = lambda: FakeRunGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    client = TestClient(app)
    headers = _auth(ctx, "runner_dup")
    source = _create_session(client, headers)
    source_quantity = source["prescriptions"][0]["prescribed_quantity"]
    assert source_quantity["kind"] == "distance"  # guard: the source really is a run

    # Act
    response = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=headers
    )

    # Assert — the copy's prescription carries the same typed distance, not a dropped target
    assert response.status_code == 200
    copy_quantity = response.json()["data"]["prescriptions"][0]["prescribed_quantity"]
    assert copy_quantity == source_quantity
    assert copy_quantity["kind"] == "distance"


def test_duplicate_preserves_the_author_on_the_read():
    # Arrange — the owner (with a display name) creates a Session and duplicates it. Author
    # is immutable origin (CONTEXT: Author, ADR-0043), so the copy's read still credits the
    # creator rather than reading authorless.
    profiles = InMemoryProfileRepository()
    profiles.update("user_dup", ProfileUpdate(display_name="Jordan Lee"))
    client, ctx = build_client(profiles=profiles)
    headers = _auth(ctx, "user_dup")
    source = _create_session(client, headers)

    # Act
    copy = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=headers
    ).json()["data"]

    # Assert — the copy carries the source's Author forward on its read payload (the endpoint
    # duplicates as the owner, so author == owner here; non-re-attribution when author differs
    # from the duplicating user is proven at the repository seam, test_session_duplicate.py)
    assert copy["author"] == source["author"]
    assert copy["author"] == {"display_name": "Jordan Lee"}


def test_duplicate_404s_for_another_users_session():
    # Arrange — a non-owner can never copy another user's plan
    client, ctx = build_client()
    source = _create_session(client, _auth(ctx, "user_owner"))

    # Act
    response = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=_auth(ctx, "user_intruder")
    )

    # Assert
    assert response.status_code == 404


def test_duplicate_404s_for_an_unknown_session():
    client, ctx = build_client()
    response = client.post(
        "/api/sessions/424242/duplicate", headers=_auth(ctx, "user_any")
    )
    assert response.status_code == 404
