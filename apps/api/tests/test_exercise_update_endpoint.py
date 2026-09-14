"""The admin partial-edit endpoint (issue #502, ADR-0075/0076 spec §5).

``PATCH /api/exercises/{id}`` lets an operator correct one Catalog Exercise's descriptive
content — description, Execution Steps, targeted muscles, required equipment, difficulty,
the display name, and the Primary/Secondary emphasis split — sending only the changed
fields. These tests pin: the route is operator-only (401 unauthenticated, 403 for a
verified non-operator), a partial edit writes the sent fields and returns the updated
Exercise via the envelope, a rename that collides with a *different* movement is a 409 that
changes nothing while a same-identity rename succeeds, invalid input is 422, a missing
Exercise is 404, and Provenance is untouched by the edit. Repositories are injected via
dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import (
    get_exercise_image_repository,
    get_exercise_relationship_repository,
    get_exercise_repository,
)
from app.repositories.exercise_image_repository import (
    InMemoryExerciseImageRepository,
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
    images = InMemoryExerciseImageRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_exercise_relationship_repository] = (
        lambda: relationships
    )
    app.dependency_overrides[get_exercise_image_repository] = lambda: images
    return TestClient(app), ctx, exercises


def _operator(ctx):
    return {"Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'admin'})}"}


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _seed(exercises: InMemoryExerciseRepository):
    return exercises.find_or_create(
        "Walking Lunge",
        provenance=Provenance.AI_GENERATED,
        description="A split-stance stride.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Step forward."],
        difficulty=3,
    )


def test_update_requires_authentication():
    client, _, exercises = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}", json={"description": "x"}
    )

    assert response.status_code == 401


def test_update_rejects_a_verified_non_operator():
    client, ctx, exercises = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"description": "x"},
        headers=_normal_user(ctx),
    )

    # Fails closed for a non-operator (ADR-0046); the edit never lands.
    assert response.status_code == 403
    assert exercises.get(exercise.id).description == "A split-stance stride."


def test_update_writes_supplied_fields_and_returns_the_exercise():
    client, ctx, exercises = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={
            "description": "A long split-stance stride.",
            "difficulty": 4,
            "primary_muscles": ["quads"],
            "secondary_muscles": ["glutes"],
        },
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["description"] == "A long split-stance stride."
    assert data["difficulty"] == 4
    assert data["primary_muscles"] == ["quads"]
    assert data["secondary_muscles"] == ["glutes"]
    # Untouched fields are preserved (partial edit).
    assert data["targeted_muscles"] == ["quads", "glutes"]
    assert data["instructions"] == ["Step forward."]


def test_update_renames_and_recomputes_identity():
    client, ctx, exercises = build_client()
    exercise = exercises.find_or_create("Barbel Squat", provenance=Provenance.CURATED)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"name": "Barbell Squat"},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Barbell Squat"
    assert exercises.get(exercise.id).normalized_name == "barbell squat"


def test_update_rejects_a_colliding_rename_with_409_and_changes_nothing():
    client, ctx, exercises = build_client()
    exercises.find_or_create("Front Squat", provenance=Provenance.CURATED)
    other = exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)

    response = client.patch(
        f"/api/exercises/{other.id}",
        json={"name": "front squat"},
        headers=_operator(ctx),
    )

    assert response.status_code == 409
    assert response.json()["success"] is False
    # Nothing merged: the colliding row is untouched.
    assert exercises.get(other.id).name == "Goblet Squat"


def test_update_accepts_a_same_identity_casing_fix():
    client, ctx, exercises = build_client()
    exercise = exercises.find_or_create("back squat", provenance=Provenance.CURATED)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"name": "Back Squat"},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Back Squat"
    assert exercises.get(exercise.id).normalized_name == "back squat"


def test_update_rejects_a_blank_name_with_422():
    client, ctx, exercises = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"name": "   "},
        headers=_operator(ctx),
    )

    assert response.status_code == 422


def test_update_rejects_an_out_of_range_difficulty_with_422():
    client, ctx, exercises = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"difficulty": 99},
        headers=_operator(ctx),
    )

    assert response.status_code == 422


def test_update_on_a_missing_exercise_returns_404():
    client, ctx, _ = build_client()

    response = client.patch(
        "/api/exercises/9999",
        json={"description": "x"},
        headers=_operator(ctx),
    )

    assert response.status_code == 404


def test_update_leaves_provenance_untouched():
    client, ctx, exercises = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"description": "corrected"},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    # Provenance is a separate deliberate act (spec §5); a descriptive edit never moves it.
    assert response.json()["data"]["provenance"] == Provenance.AI_GENERATED.value
    assert exercises.get(exercise.id).provenance == Provenance.AI_GENERATED.value
