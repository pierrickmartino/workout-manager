"""The Exercise detail endpoint: enriched catalog detail plus typed relationships.

A user opens an Exercise to read its description, execution instructions, targeted
muscles, difficulty, required equipment, Variations, Alternatives, and precautions
(CONTEXT.md, Slice 11). The catalog is global and shared, but the endpoint still
requires authentication like the rest of the API. Repositories are injected via
dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.main import create_app
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
)
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from tests.conftest import ISSUER, make_signing_context


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    relationships = InMemoryExerciseRelationshipRepository(exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_exercise_relationship_repository] = (
        lambda: relationships
    )
    return TestClient(app), ctx, exercises, relationships


def _auth(ctx, sub="user_x"):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def test_exercise_detail_requires_authentication():
    client, _, _, _ = build_client()
    assert client.get("/api/exercises/1").status_code == 401


def test_unknown_exercise_is_not_found():
    client, ctx, _, _ = build_client()
    assert client.get("/api/exercises/999", headers=_auth(ctx)).status_code == 404


def test_exercise_detail_surfaces_enriched_fields_and_relationships():
    # Arrange — a curated squat with full detail, one Variation, one Alternative
    client, ctx, exercises, relationships = build_client()
    squat = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        description="A barbell squat.",
        targeted_muscles=["quads", "glutes"],
        required_equipment=["barbell"],
        instructions="Brace and sit down between your hips.",
        difficulty=6,
        precautions=["keep a neutral spine"],
    )
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    goblet = exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, goblet.id, RelationKind.ALTERNATIVE)

    # Act
    response = client.get(f"/api/exercises/{squat.id}", headers=_auth(ctx))

    # Assert — enriched detail plus the split relationship lists
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Back Squat"
    assert data["instructions"] == "Brace and sit down between your hips."
    assert data["difficulty"] == 6
    assert data["precautions"] == ["keep a neutral spine"]
    assert data["targeted_muscles"] == ["quads", "glutes"]
    assert [v["name"] for v in data["variations"]] == ["Box Squat"]
    assert [a["name"] for a in data["alternatives"]] == ["Goblet Squat"]
