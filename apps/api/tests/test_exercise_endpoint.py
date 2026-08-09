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
        primary_muscles=["quads"],
        secondary_muscles=["glutes"],
        required_equipment=["barbell"],
        instructions=["Brace your core.", "Sit down between your hips."],
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
    assert data["instructions"] == [
        "Brace your core.",
        "Sit down between your hips.",
    ]
    assert data["difficulty"] == 6
    assert data["precautions"] == ["keep a neutral spine"]
    # The flat union stays the durable analytics-facing field; the Primary/Secondary
    # emphasis split (ADR-0016) rides alongside it.
    assert data["targeted_muscles"] == ["quads", "glutes"]
    assert data["primary_muscles"] == ["quads"]
    assert data["secondary_muscles"] == ["glutes"]
    assert [v["name"] for v in data["variations"]] == ["Box Squat"]
    assert [a["name"] for a in data["alternatives"]] == ["Goblet Squat"]


def test_exercise_detail_round_trips_a_curated_image():
    # Arrange — a curated Exercise with a curator-set Exercise Image
    client, ctx, exercises, _ = build_client()
    squat = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        image="https://cdn.example.com/curated/back-squat.svg",
    )

    # Act
    response = client.get(f"/api/exercises/{squat.id}", headers=_auth(ctx))

    # Assert — the image is surfaced verbatim in the detail payload
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["image"] == "https://cdn.example.com/curated/back-squat.svg"


def test_exercise_detail_serializes_a_missing_image_as_null():
    # Arrange — a movement with no image (the frictionless name-only case)
    client, ctx, exercises, _ = build_client()
    stub = exercises.find_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)

    # Act
    response = client.get(f"/api/exercises/{stub.id}", headers=_auth(ctx))

    # Assert — the absent image never degrades the response; it is simply null
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["image"] is None


def test_exercise_detail_reports_enriched_for_a_full_gold_movement():
    # Arrange — a curated movement carrying every field the gold bar reads
    client, ctx, exercises, _ = build_client()
    squat = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        description="A barbell squat.",
        targeted_muscles=["quads", "glutes"],
        primary_muscles=["quads"],
        secondary_muscles=["glutes"],
        instructions=["Brace your core."],
        difficulty=6,
        precautions=["keep a neutral spine"],
        image="https://cdn.example.com/curated/back-squat.svg",
    )

    # Act
    response = client.get(f"/api/exercises/{squat.id}", headers=_auth(ctx))

    # Assert — the detail payload carries the read-time completeness tier (ADR-0041)
    assert response.status_code == 200
    assert response.json()["data"]["completeness"] == "enriched"


def test_exercise_detail_reports_listable_when_a_gold_field_is_missing():
    # Arrange — described, with muscles and a step, but no Exercise Image
    client, ctx, exercises, _ = build_client()
    lunge = exercises.find_or_create(
        "Walking Lunge",
        provenance=Provenance.CURATED,
        description="A split-stance stride.",
        targeted_muscles=["quads", "glutes"],
        primary_muscles=["quads"],
        secondary_muscles=["glutes"],
        instructions=["Step forward and lower."],
        difficulty=4,
        precautions=["keep the front knee tracking the toes"],
    )

    # Act
    response = client.get(f"/api/exercises/{lunge.id}", headers=_auth(ctx))

    # Assert — a single missing gold field (the image) keeps it Listable, not Enriched
    assert response.status_code == 200
    assert response.json()["data"]["completeness"] == "listable"


def test_exercise_detail_reports_stub_for_a_curated_but_thin_movement():
    # Arrange — a curated (trusted) movement with nothing but a name
    client, ctx, exercises, _ = build_client()
    thin = exercises.find_or_create("Jefferson Curl", provenance=Provenance.CURATED)

    # Act
    response = client.get(f"/api/exercises/{thin.id}", headers=_auth(ctx))

    # Assert — completeness is provenance-blind: curated does not lift a Stub
    assert response.status_code == 200
    assert response.json()["data"]["completeness"] == "stub"


def test_exercise_detail_omits_primacy_for_a_flat_muscle_list():
    # Arrange — a curated Exercise with only a flat targeted-muscle list, no split
    client, ctx, exercises, _ = build_client()
    plank = exercises.find_or_create(
        "Plank",
        provenance=Provenance.CURATED,
        targeted_muscles=["core"],
    )

    # Act
    response = client.get(f"/api/exercises/{plank.id}", headers=_auth(ctx))

    # Assert — the union is served, and the split is empty (no fabricated primacy)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["targeted_muscles"] == ["core"]
    assert data["primary_muscles"] == []
    assert data["secondary_muscles"] == []
