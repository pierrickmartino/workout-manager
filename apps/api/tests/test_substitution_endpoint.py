"""The Substitution endpoint end to end: real JWKS verification, the repositories,
the substitution service, and the response envelope wired through FastAPI.

A Substitution swaps one Exercise Prescription's Exercise on the user's own Session
copy — lookup-first over the catalog, AI fallback only when nothing fits — and is
distinct from Regeneration. The AI generator and repositories are injected via
dependency overrides so the tests run offline and deterministically."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.generation.generator import GenerationError, GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.generation.substitute_generator import SubstituteRequest
from app.generation.schema import GeneratedSubstitute
from app.main import create_app
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
    get_substitute_generator,
)
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5"
                ),
                GeneratedExercisePrescription(
                    exercise_name="Overhead Press", sets=3, reps="8-12"
                ),
            ]
        )


class FakeSubstituteGenerator:
    def __init__(self, *, error=None):
        self._error = error

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        if self._error is not None:
            raise self._error
        return GeneratedSubstitute(
            exercise_name="Wall Sit",
            targeted_muscles=["quads"],
            required_equipment=[],
        )


def build_client(substitute_generator=None):
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    relationships = InMemoryExerciseRelationshipRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_exercise_relationship_repository] = (
        lambda: relationships
    )
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_substitute_generator] = (
        lambda: substitute_generator or FakeSubstituteGenerator()
    )
    return TestClient(app), ctx, exercises, relationships


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def test_substitute_requires_authentication():
    client, _, _, _ = build_client()
    response = client.post("/api/sessions/1/prescriptions/0/substitute")
    assert response.status_code == 401


def test_substitute_swaps_a_catalog_resolved_variation_in_place():
    # Arrange — generate, then link a Box Squat Variation of the squat
    client, ctx, exercises, relationships = build_client()
    headers = _auth(ctx, "user_sub")
    session = _create_session(client, headers)
    squat_id = session["prescriptions"][0]["exercise_id"]
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    relationships.add(squat_id, box.id, RelationKind.VARIATION)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions/0/substitute",
        headers=headers,
    )

    # Assert — the catalog Variation is swapped in; the guard stays clear
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["prescriptions"][0]["exercise_name"] == "Box Squat"
    assert data["prescriptions"][0]["sets"] == 5
    assert data["has_been_regenerated"] is False


def test_substitute_falls_back_to_ai_when_no_catalog_link_fits():
    client, ctx, _, _ = build_client()
    headers = _auth(ctx, "user_sub2")
    session = _create_session(client, headers)

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions/0/substitute",
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["prescriptions"][0]["exercise_name"] == "Wall Sit"
    assert data["prescriptions"][0]["provenance"] == "ai_generated"


def test_substitute_returns_502_when_the_ai_fallback_fails():
    # Arrange — no catalog link fits, and the AI fallback blows up
    client, ctx, _, _ = build_client(
        substitute_generator=FakeSubstituteGenerator(error=GenerationError("bad"))
    )
    headers = _auth(ctx, "user_badsub")
    session = _create_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions/0/substitute",
        headers=headers,
    )

    # Assert
    assert response.status_code == 502
    assert response.json()["success"] is False


def test_substitute_on_an_unowned_session_is_not_found():
    client, ctx, _, _ = build_client()
    session = _create_session(client, _auth(ctx, "owner"))

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions/0/substitute",
        headers=_auth(ctx, "intruder"),
    )
    assert response.status_code == 404


def test_substitute_at_an_absent_position_is_not_found():
    client, ctx, _, _ = build_client()
    headers = _auth(ctx, "user_sub3")
    session = _create_session(client, headers)

    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions/99/substitute",
        headers=headers,
    )
    assert response.status_code == 404
