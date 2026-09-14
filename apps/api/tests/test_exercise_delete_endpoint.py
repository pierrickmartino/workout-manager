"""Admin guarded hard-delete endpoint (issue #507, ADR-0076).

``DELETE /api/exercises/{id}`` permanently removes a Catalog Exercise, but only when the
retire-then-delete guard passes: the Exercise must be **Retired** *and* wholly
**unreferenced** (no Exercise Prescription, Logged Set, or Relationship points at it). Any
other attempt is refused with ``409`` and changes nothing, a missing Exercise is ``404``,
and every path is operator-only (``require_admin``, ADR-0046). A successful delete is
``204`` and writes a ``hard_delete`` audit record that survives the deleted row (its
``exercise_id`` is a plain int and its ``detail`` keeps the deleted normalized name).
Repositories are injected via dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.exercise_audit import AuditAction
from app.main import create_app
from app.repositories.deps import (
    get_exercise_audit_repository,
    get_exercise_image_repository,
    get_exercise_relationship_repository,
    get_exercise_repository,
)
from app.repositories.exercise_audit_repository import (
    InMemoryExerciseAuditRepository,
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
    audit = InMemoryExerciseAuditRepository()
    images = InMemoryExerciseImageRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_exercise_relationship_repository] = (
        lambda: relationships
    )
    app.dependency_overrides[get_exercise_audit_repository] = lambda: audit
    app.dependency_overrides[get_exercise_image_repository] = lambda: images
    return TestClient(app), ctx, exercises, audit, images


def _operator(ctx, sub: str = "user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _retired(exercises: InMemoryExerciseRepository, name: str = "Kipping Pull-Up"):
    exercise = exercises.find_or_create(name, provenance=Provenance.AI_GENERATED)
    exercises.retire(exercise.id)
    return exercises.get(exercise.id)


# --- Auth matrix ------------------------------------------------------------------------


def test_delete_requires_authentication():
    client, _, exercises, _, _ = build_client()
    exercise = _retired(exercises)

    response = client.delete(f"/api/exercises/{exercise.id}")

    assert response.status_code == 401
    # Fails closed: the row is untouched.
    assert exercises.get(exercise.id) is not None


def test_delete_rejects_a_verified_non_operator():
    client, ctx, exercises, audit, _ = build_client()
    exercise = _retired(exercises)

    response = client.delete(
        f"/api/exercises/{exercise.id}", headers=_normal_user(ctx)
    )

    # Fails closed (ADR-0046): no delete and no audit trail entry.
    assert response.status_code == 403
    assert exercises.get(exercise.id) is not None
    assert audit.list_for(exercise.id) == []


# --- Guard: refusals change nothing -----------------------------------------------------


def test_delete_of_a_missing_exercise_is_404():
    client, ctx, _, _, _ = build_client()

    response = client.delete("/api/exercises/9999", headers=_operator(ctx))

    assert response.status_code == 404


def test_delete_refuses_an_exercise_that_is_not_retired():
    client, ctx, exercises, audit, _ = build_client()
    # Active (never retired) — retire-then-delete forbids this even with zero references.
    exercise = exercises.find_or_create("Air Squat", provenance=Provenance.CURATED)

    response = client.delete(
        f"/api/exercises/{exercise.id}", headers=_operator(ctx)
    )

    assert response.status_code == 409
    assert exercises.get(exercise.id) is not None
    assert audit.list_for(exercise.id) == []


def test_delete_refuses_a_referenced_exercise_even_when_retired():
    client, ctx, exercises, audit, _ = build_client()
    exercise = _retired(exercises, name="Back Squat")
    # A live plan / settled record / relationship points at it.
    exercises.register_reference(exercise.id)

    response = client.delete(
        f"/api/exercises/{exercise.id}", headers=_operator(ctx)
    )

    assert response.status_code == 409
    assert exercises.get(exercise.id) is not None
    assert audit.list_for(exercise.id) == []


# --- Happy path -------------------------------------------------------------------------


def test_delete_removes_a_retired_unreferenced_exercise():
    client, ctx, exercises, _, _ = build_client()
    exercise = _retired(exercises, name="Junk Movement")

    response = client.delete(
        f"/api/exercises/{exercise.id}", headers=_operator(ctx)
    )

    assert response.status_code == 204
    assert response.content == b""
    assert exercises.get(exercise.id) is None


def test_delete_writes_a_hard_delete_audit_that_survives_the_row():
    client, ctx, exercises, audit, _ = build_client()
    exercise = _retired(exercises, name="Duplicate Curl")
    normalized_name = exercise.normalized_name

    client.delete(
        f"/api/exercises/{exercise.id}",
        headers=_operator(ctx, sub="user_curator"),
    )

    # The trail outlives the deleted row: exercise_id is a plain int and the detail keeps
    # the deleted normalized name so the record says what was destroyed.
    records = audit.list_for(exercise.id)
    assert len(records) == 1
    assert records[0].actor == "user_curator"
    assert records[0].action == AuditAction.HARD_DELETE.value
    assert records[0].detail == {"name": normalized_name}


def test_detail_exposes_reference_count_to_the_operator_editor():
    client, ctx, exercises, _, _ = build_client()
    exercise = exercises.find_or_create("Cable Fly", provenance=Provenance.CURATED)
    exercises.register_reference(exercise.id, count=2)

    # The admin editor reads reference_count (with retired) off the shared detail to decide
    # whether the guarded delete is offered — so GET /{id} surfaces it for an operator.
    detail = client.get(f"/api/exercises/{exercise.id}", headers=_operator(ctx))

    assert detail.status_code == 200
    assert detail.json()["data"]["reference_count"] == 2


def test_detail_hides_reference_count_from_a_non_operator():
    client, ctx, exercises, _, _ = build_client()
    exercise = exercises.find_or_create("Pec Deck", provenance=Provenance.CURATED)
    exercises.register_reference(exercise.id, count=2)

    # A normal user never uses the count and must not pay for it: it is null on the public path
    # (the operator-only gate keeps the three COUNT queries off the hot detail read, issue #507).
    detail = client.get(f"/api/exercises/{exercise.id}", headers=_normal_user(ctx))

    assert detail.status_code == 200
    assert detail.json()["data"]["reference_count"] is None


def test_delete_also_removes_the_uploaded_image():
    client, ctx, exercises, _, images = build_client()
    exercise = _retired(exercises, name="Obsolete Row")
    images.put(
        exercise_id=exercise.id,
        content_type="image/png",
        image_bytes=b"\x89PNG",
        byte_size=4,
        uploaded_by="user_admin",
    )
    assert images.exists(exercise.id) is True

    response = client.delete(
        f"/api/exercises/{exercise.id}", headers=_operator(ctx)
    )

    # The Exercise's owned image (an FK child) is cleaned up with the row.
    assert response.status_code == 204
    assert images.exists(exercise.id) is False
