"""The resolve-or-create Exercise endpoint (ADR-0033).

``POST /api/exercises`` takes a movement name and returns the catalog Exercise it
resolves to — an existing entry by normalized-name dedup (ADR-0002), or a new
``user_entered`` one created on a miss. It is the picker's create-on-miss step for
plan-less logging (ADR-0031): the log write itself stays id-only and untouched, so
the catalog is grown here, deliberately, and never inside ``log_session``.

These tests pin: auth is required; a miss mints a ``user_entered`` entry; a hit
returns the existing entry without changing its Provenance; dedup collapses casing;
and blank or over-long names are rejected at the boundary without creating anything.
Repositories are injected via dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance, normalize_name
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


def test_create_requires_authentication():
    client, _, _ = build_client()
    assert client.post("/api/exercises", json={"name": "Running"}).status_code == 401


def test_create_on_miss_mints_a_user_entered_exercise():
    # Arrange — an empty catalog
    client, ctx, exercises = build_client()

    # Act — the picker creates a movement the catalog has never seen
    response = client.post(
        "/api/exercises", json={"name": "Trail Running"}, headers=_auth(ctx)
    )

    # Assert — a new entry, flagged user_entered (the least-validated tier, ADR-0033)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Trail Running"
    assert data["provenance"] == Provenance.USER_ENTERED.value
    assert data["id"] is not None
    # and it is now really in the shared catalog for the log write to reference
    assert exercises.get(data["id"]).name == "Trail Running"


def test_create_resolves_an_existing_entry_without_changing_provenance():
    # Arrange — a curated "Running" already seeded
    client, ctx, exercises = build_client()
    seeded = exercises.find_or_create("Running", provenance=Provenance.CURATED)

    # Act — the picker "creates" the same movement
    response = client.post(
        "/api/exercises", json={"name": "running"}, headers=_auth(ctx)
    )

    # Assert — it resolves to the curated row (same id), trust untouched (ADR-0002)
    data = response.json()["data"]
    assert data["id"] == seeded.id
    assert data["provenance"] == Provenance.CURATED.value


def test_create_dedups_on_normalized_name():
    # Arrange
    client, ctx, exercises = build_client()

    # Act — two creates differing only in casing/spacing
    first = client.post(
        "/api/exercises", json={"name": "Box Jump"}, headers=_auth(ctx)
    )
    second = client.post(
        "/api/exercises", json={"name": "  box   jump "}, headers=_auth(ctx)
    )

    # Assert — one catalog entry, reused (ADR-0002 dedup), not two
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert exercises.list_by_provenance(Provenance.USER_ENTERED).__len__() == 1


def test_create_rejects_a_blank_name_and_creates_nothing():
    # Arrange
    client, ctx, exercises = build_client()

    # Act — a whitespace-only name has no normalized identity
    response = client.post(
        "/api/exercises", json={"name": "   "}, headers=_auth(ctx)
    )

    # Assert — rejected at the boundary, nothing minted
    assert response.status_code == 422
    assert exercises.list_by_provenance(Provenance.USER_ENTERED) == []


def test_create_rejects_an_over_long_name():
    # Arrange
    client, ctx, exercises = build_client()

    # Act — a name past the sane cap (a junk paste, not a movement)
    response = client.post(
        "/api/exercises", json={"name": "x" * 200}, headers=_auth(ctx)
    )

    # Assert — rejected, and nothing entered the shared catalog
    assert response.status_code == 422
    assert exercises.search(normalize_name("x" * 200), limit=5, offset=0).total == 0
