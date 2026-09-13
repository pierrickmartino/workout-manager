"""The admin catalog-browser endpoint (issue #501, ADR-0076).

``GET /api/admin/exercises`` is the operator-only ops view of the shared Catalog: a paged,
filterable list spanning **every** Provenance and Completeness tier (Stubs included) and
both retired and active rows — not the user-facing, Listable-only catalog. Each row carries
its computed Completeness tier (the internal signal hidden from the public catalog) and its
retired state (for the later editor). These tests pin: the route is operator-only (401
unauthenticated, 403 for a verified non-operator), the list hides nothing, the filters
compose, and each row carries the tier + retired flag. Repositories are injected via
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


def _operator(ctx):
    return {"Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'admin'})}"}


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _seed_mixed_catalog(exercises: InMemoryExerciseRepository) -> None:
    """A Stub, a Listable, and an Enriched — one per tier, spanning Provenance."""

    exercises.find_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)
    exercises.find_or_create(
        "Walking Lunge",
        provenance=Provenance.AI_GENERATED,
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


def test_browse_requires_authentication():
    client, _, _ = build_client()
    assert client.get("/api/admin/exercises").status_code == 401


def test_browse_rejects_a_verified_non_operator():
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    response = client.get("/api/admin/exercises", headers=_normal_user(ctx))

    # The ops feed fails closed for a non-operator (ADR-0046).
    assert response.status_code == 403


def test_browse_lists_every_provenance_and_tier_with_completeness_and_retired():
    # Arrange — one movement per tier, spanning Provenance
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    # Act
    response = client.get("/api/admin/exercises", headers=_operator(ctx))

    # Assert — every row (Stub included), each carrying its computed tier and retired
    assert response.status_code == 200
    body = response.json()
    rows = body["data"]
    assert [row["name"] for row in rows] == [
        "Back Squat",
        "Jefferson Curl",
        "Walking Lunge",
    ]
    by_name = {row["name"]: row for row in rows}
    assert by_name["Jefferson Curl"]["completeness"] == "stub"
    assert by_name["Walking Lunge"]["completeness"] == "listable"
    assert by_name["Back Squat"]["completeness"] == "enriched"
    assert all(row["retired"] is False for row in rows)
    assert by_name["Back Squat"]["provenance"] == "curated"
    # Pagination meta rides alongside the data.
    assert body["meta"]["total"] == 3


def test_browse_composes_name_provenance_and_completeness_filters():
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    response = client.get(
        "/api/admin/exercises",
        params={"q": "squat", "provenance": "curated", "completeness": "enriched"},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    body = response.json()
    assert [row["name"] for row in body["data"]] == ["Back Squat"]
    assert body["meta"]["total"] == 1


def test_browse_surfaces_and_filters_retired_rows():
    # Arrange — retire one movement directly (the retire endpoint lands later)
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)
    retired = exercises.find_or_create("Sissy Squat", provenance=Provenance.CURATED)
    retired.retired = True

    # Act — the retired filter isolates the tombstoned rows the public catalog hides
    response = client.get(
        "/api/admin/exercises", params={"retired": "true"}, headers=_operator(ctx)
    )

    # Assert
    assert response.status_code == 200
    rows = response.json()["data"]
    assert [row["name"] for row in rows] == ["Sissy Squat"]
    assert rows[0]["retired"] is True


def test_browse_ignores_unrecognized_filter_values():
    # Arrange
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    # Act — an unknown provenance/completeness value is dropped, not a 422 (ADR-0042 style)
    response = client.get(
        "/api/admin/exercises",
        params={"provenance": "nonsense", "completeness": "bogus"},
        headers=_operator(ctx),
    )

    # Assert — the whole catalog is returned as though the bad filters were absent
    assert response.status_code == 200
    assert response.json()["meta"]["total"] == 3


def test_browse_paginates_with_full_total():
    client, ctx, exercises = build_client()
    _seed_mixed_catalog(exercises)

    response = client.get(
        "/api/admin/exercises",
        params={"limit": 1, "offset": 1},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    body = response.json()
    assert [row["name"] for row in body["data"]] == ["Jefferson Curl"]
    assert body["meta"] == {"total": 3, "limit": 1, "offset": 1}
