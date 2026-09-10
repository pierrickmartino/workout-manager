"""The admin catalog-completeness breakdown endpoint (ADR-0041, revised).

``GET /api/exercises/completeness-breakdown`` returns catalog-health counts by
Completeness tier — decision-support for the enrichment backfill. These tests pin:
the route is operator-only (401 unauthenticated, 403 for a verified non-operator),
and the counts tally each tier over the catalog with a summed total. Catalog
Completeness is an internal/ops axis — never on a user-facing read — so this is the
one place it surfaces, and it sits behind ``require_admin``. Repositories are injected
via dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import get_exercise_repository
from app.repositories.exercise_repository import InMemoryExerciseRepository
from tests.conftest import ISSUER, make_signing_context


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    return TestClient(app), ctx, exercises


def _operator(ctx):
    return {"Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'admin'})}"}


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _seed_mixed_catalog(exercises: InMemoryExerciseRepository) -> None:
    """Two Stubs, one Listable, one Enriched — one movement per tier boundary."""

    exercises.find_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)
    exercises.find_or_create("Sissy Squat", provenance=Provenance.CURATED)
    exercises.find_or_create(
        "Walking Lunge",
        provenance=Provenance.CURATED,
        description="A split-stance stride.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Step forward and lower."],
    )
    exercises.find_or_create(
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


def test_breakdown_requires_authentication():
    client, _, _ = build_client()
    assert client.get("/api/exercises/completeness-breakdown").status_code == 401


def test_breakdown_rejects_a_verified_non_operator():
    # Arrange — a populated catalog and a normal signed-in user
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    # Act
    response = client.get(
        "/api/exercises/completeness-breakdown", headers=_normal_user(ctx)
    )

    # Assert — the ops readout fails closed for a non-operator (ADR-0046)
    assert response.status_code == 403


def test_breakdown_tallies_each_tier_for_an_operator():
    # Arrange — a mixed catalog spanning all three tiers
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    # Act
    response = client.get(
        "/api/exercises/completeness-breakdown", headers=_operator(ctx)
    )

    # Assert — per-tier counts with a summed total, in the standard envelope
    assert response.status_code == 200
    assert response.json()["data"] == {
        "stub": 2,
        "listable": 1,
        "enriched": 1,
        "total": 4,
    }


def test_breakdown_of_an_empty_catalog_is_all_zero():
    # Arrange — no movements seeded
    client, ctx, _ = build_client()

    # Act
    response = client.get(
        "/api/exercises/completeness-breakdown", headers=_operator(ctx)
    )

    # Assert — an honest all-zero readout, never a divide-by-zero downstream
    assert response.status_code == 200
    assert response.json()["data"] == {
        "stub": 0,
        "listable": 0,
        "enriched": 0,
        "total": 0,
    }
