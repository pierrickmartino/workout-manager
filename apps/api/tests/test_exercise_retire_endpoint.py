"""Admin retire / un-retire endpoints and their discovery enforcement (issue #506).

``POST /api/exercises/{id}/retire`` sets the reversible Catalog tombstone (ADR-0076) and
``POST /api/exercises/{id}/unretire`` clears it; both are operator-only and audited. These
tests pin: every route is operator-only (401 / 403), a missing Exercise is 404, retire hides
the movement from catalog browse, the equipment facets, and Substitution candidates while
``GET /{id}`` still resolves it, un-retire restores discovery, and the acts write audit
records (``retire`` / ``unretire``) while the flag flip is idempotent. Repositories are
injected via dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.exercise_audit import AuditAction
from app.domain.substitution import RelationKind
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
    return TestClient(app), ctx, exercises, relationships, audit


def _operator(ctx, sub: str = "user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _seed(exercises: InMemoryExerciseRepository, name: str = "Kipping Pull-Up"):
    return exercises.find_or_create(name, provenance=Provenance.AI_GENERATED)


# --- Auth matrix ------------------------------------------------------------------------


def test_retire_requires_authentication():
    client, _, exercises, _, _ = build_client()
    exercise = _seed(exercises)

    response = client.post(f"/api/exercises/{exercise.id}/retire")

    assert response.status_code == 401


def test_retire_rejects_a_verified_non_operator():
    client, ctx, exercises, _, audit = build_client()
    exercise = _seed(exercises)

    response = client.post(
        f"/api/exercises/{exercise.id}/retire", headers=_normal_user(ctx)
    )

    # Fails closed (ADR-0046): no change and no audit trail entry.
    assert response.status_code == 403
    assert exercises.get(exercise.id).retired is False
    assert audit.list_for(exercise.id) == []


def test_unretire_rejects_a_verified_non_operator():
    client, ctx, exercises, _, _ = build_client()
    exercise = _seed(exercises)
    exercises.retire(exercise.id)

    response = client.post(
        f"/api/exercises/{exercise.id}/unretire", headers=_normal_user(ctx)
    )

    assert response.status_code == 403
    assert exercises.get(exercise.id).retired is True


# --- Happy paths ------------------------------------------------------------------------


def test_retire_sets_the_flag_and_returns_the_exercise():
    client, ctx, exercises, _, _ = build_client()
    exercise = _seed(exercises)

    response = client.post(
        f"/api/exercises/{exercise.id}/retire", headers=_operator(ctx)
    )

    assert response.status_code == 200
    assert response.json()["data"]["retired"] is True
    assert exercises.get(exercise.id).retired is True


def test_unretire_clears_the_flag_and_returns_the_exercise():
    client, ctx, exercises, _, _ = build_client()
    exercise = _seed(exercises)
    exercises.retire(exercise.id)

    response = client.post(
        f"/api/exercises/{exercise.id}/unretire", headers=_operator(ctx)
    )

    assert response.status_code == 200
    assert response.json()["data"]["retired"] is False
    assert exercises.get(exercise.id).retired is False


def test_retire_writes_an_audit_record_with_actor_and_action():
    client, ctx, exercises, _, audit = build_client()
    exercise = _seed(exercises)

    client.post(
        f"/api/exercises/{exercise.id}/retire",
        headers=_operator(ctx, sub="user_curator"),
    )

    records = audit.list_for(exercise.id)
    assert len(records) == 1
    assert records[0].actor == "user_curator"
    assert records[0].action == AuditAction.RETIRE.value


def test_unretire_writes_an_audit_record():
    client, ctx, exercises, _, audit = build_client()
    exercise = _seed(exercises)
    exercises.retire(exercise.id)

    client.post(f"/api/exercises/{exercise.id}/unretire", headers=_operator(ctx))

    records = audit.list_for(exercise.id)
    assert [r.action for r in records] == [AuditAction.UNRETIRE.value]


def test_retiring_an_already_retired_exercise_records_nothing():
    client, ctx, exercises, _, audit = build_client()
    exercise = _seed(exercises)
    exercises.retire(exercise.id)

    response = client.post(
        f"/api/exercises/{exercise.id}/retire", headers=_operator(ctx)
    )

    # Idempotent: still retired, still 200, but the trail holds only real transitions.
    assert response.status_code == 200
    assert exercises.get(exercise.id).retired is True
    assert audit.list_for(exercise.id) == []


def test_retire_and_unretire_on_a_missing_exercise_are_404():
    client, ctx, _, _, _ = build_client()

    assert (
        client.post("/api/exercises/9999/retire", headers=_operator(ctx)).status_code
        == 404
    )
    assert (
        client.post("/api/exercises/9999/unretire", headers=_operator(ctx)).status_code
        == 404
    )


# --- Discovery enforcement (ADR-0076) ---------------------------------------------------


def test_retire_hides_the_exercise_from_catalog_browse_but_get_by_id_resolves():
    client, ctx, exercises, _, _ = build_client()
    exercise = exercises.find_or_create(
        "Zercher Carry",
        provenance=Provenance.CURATED,
        required_equipment=["barbell"],
    )
    user = {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}

    client.post(f"/api/exercises/{exercise.id}/retire", headers=_operator(ctx))

    # Discovery: browse no longer surfaces it.
    browse = client.get("/api/exercises?query=zercher", headers=user)
    assert browse.status_code == 200
    assert [row["id"] for row in browse.json()["data"]] == []

    # ...nor do the equipment facets derived from the whole catalog.
    facets = client.get("/api/exercises/facets", headers=user)
    assert "barbell" not in facets.json()["data"]["equipment"]

    # ...but the Exercise still resolves fully by id (existing references never break).
    detail = client.get(f"/api/exercises/{exercise.id}", headers=user)
    assert detail.status_code == 200
    assert detail.json()["data"]["id"] == exercise.id
    assert detail.json()["data"]["retired"] is True


def test_retire_removes_the_exercise_from_substitution_candidates():
    client, ctx, exercises, relationships, _ = build_client()
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    user = {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}

    # Before retiring, the box squat is a listed Variation on the squat's detail.
    before = client.get(f"/api/exercises/{squat.id}", headers=user)
    assert [v["id"] for v in before.json()["data"]["variations"]] == [box.id]

    client.post(f"/api/exercises/{box.id}/retire", headers=_operator(ctx))

    # After retiring, the candidate is gone from the Exercise-Detail sublist.
    after = client.get(f"/api/exercises/{squat.id}", headers=user)
    assert after.json()["data"]["variations"] == []


def test_unretire_restores_the_exercise_to_discovery():
    client, ctx, exercises, _, _ = build_client()
    exercise = exercises.find_or_create("Pistol Squat", provenance=Provenance.CURATED)
    user = {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}
    client.post(f"/api/exercises/{exercise.id}/retire", headers=_operator(ctx))

    client.post(f"/api/exercises/{exercise.id}/unretire", headers=_operator(ctx))

    browse = client.get("/api/exercises?query=pistol", headers=user)
    assert [row["id"] for row in browse.json()["data"]] == [exercise.id]
