"""The Exercise Library search endpoint (Module E, ADR-0021).

``GET /api/exercises?query=`` substring-matches the shared catalog by normalized
name and returns each match's ``id``, ``name``, ``targeted_muscles``,
``provenance``, ``required_equipment``, and ``difficulty``, ranked curated-first
then by name and paginated. It is **pick-only**: a query with no match returns an
empty result and never creates a catalog Exercise. Repositories are injected via
dependency overrides so the test runs offline."""

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


def _auth(ctx, sub="user_x"):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def test_search_requires_authentication():
    client, _, _ = build_client()
    assert client.get("/api/exercises?query=squat").status_code == 401


def test_search_returns_matches_with_the_library_fields_and_meta():
    # Arrange — a curated squat and an unrelated deadlift
    client, ctx, exercises = build_client()
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quads", "glutes"],
        required_equipment=["barbell"],
        difficulty=6,
    )
    exercises.find_or_create("Deadlift", provenance=Provenance.CURATED)

    # Act
    response = client.get("/api/exercises?query=squat", headers=_auth(ctx))

    # Assert — the match, with exactly the library fields, in the standard envelope
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    results = body["data"]
    assert len(results) == 1
    result = results[0]
    assert result["name"] == "Back Squat"
    assert result["targeted_muscles"] == ["quads", "glutes"]
    assert result["required_equipment"] == ["barbell"]
    assert result["difficulty"] == 6
    assert result["provenance"] == "curated"
    assert "id" in result
    assert body["meta"]["total"] == 1


def test_search_surfaces_the_completeness_tier_per_item():
    # Arrange — two matches at different Completeness tiers: a Stub and a Listable
    client, ctx, exercises = build_client()
    exercises.find_or_create("Squat Stub", provenance=Provenance.CURATED)
    exercises.find_or_create(
        "Squat Listable",
        provenance=Provenance.CURATED,
        description="A knee-dominant sit.",
        targeted_muscles=["quads"],
        instructions=["Sit down and stand up."],
    )

    # Act
    response = client.get("/api/exercises?query=squat", headers=_auth(ctx))

    # Assert — every item carries its read-time completeness tier (ADR-0041),
    # reflecting the underlying fields
    assert response.status_code == 200
    tiers = {r["name"]: r["completeness"] for r in response.json()["data"]}
    assert tiers == {"Squat Stub": "stub", "Squat Listable": "listable"}


def test_search_ranks_curated_before_ai_generated():
    # Arrange — a matching AI-invented movement and a curated one
    client, ctx, exercises = build_client()
    exercises.find_or_create("Air Squat", provenance=Provenance.AI_GENERATED)
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)

    # Act
    response = client.get("/api/exercises?query=squat", headers=_auth(ctx))

    # Assert — curated first, so the user sees trusted content ahead of unvalidated
    names = [r["name"] for r in response.json()["data"]]
    assert names == ["Back Squat", "Air Squat"]


def test_search_paginates_with_limit_and_offset():
    # Arrange — three curated matches, ranked Back < Front < Goblet
    client, ctx, exercises = build_client()
    exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    exercises.find_or_create("Front Squat", provenance=Provenance.CURATED)

    # Act — the second page of size one
    response = client.get(
        "/api/exercises?query=squat&limit=1&offset=1", headers=_auth(ctx)
    )

    # Assert — the middle of the ranked order, with the full count in meta
    body = response.json()
    assert [r["name"] for r in body["data"]] == ["Front Squat"]
    assert body["meta"]["total"] == 3
    assert body["meta"]["limit"] == 1
    assert body["meta"]["offset"] == 1


def test_search_with_no_match_returns_empty_and_creates_nothing():
    # Arrange
    client, ctx, exercises = build_client()
    exercises.find_or_create("Deadlift", provenance=Provenance.CURATED)

    # Act — a movement absent from the catalog
    response = client.get(
        "/api/exercises?query=clean%20and%20jerk", headers=_auth(ctx)
    )

    # Assert — empty result, and the catalog was not grown (pick-only, ADR-0021)
    body = response.json()
    assert body["data"] == []
    assert body["meta"]["total"] == 0
    assert exercises.search("clean and jerk", limit=10, offset=0).total == 0
