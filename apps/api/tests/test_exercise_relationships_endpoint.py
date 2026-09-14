"""Admin relationship-management endpoints (issue #505, spec §5).

``GET /api/exercises/{id}/relationships`` lists an Exercise's Variation/Alternative links
in **both** directions (kind + direction); ``POST`` adds a link (201) rejecting a self-link
(422) and a duplicate (409); ``DELETE`` removes a link by ``(to_id, kind)`` (204). These are
the lookup-first candidates Substitution resolves over, so the guards keep the graph clean.

These tests pin: every route is operator-only (401 / 403); the list shows both directions; add
returns 201 and creates exactly one directed row (no reciprocal); self-link is 422 and a
duplicate is 409, each writing nothing; remove returns 204 and is idempotent; a missing
Exercise (either endpoint of a link) is 404; an invalid kind is 422. Repositories are injected
via dependency overrides so the test runs offline."""

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


def _operator(ctx, sub: str = "user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _catalog(exercises: InMemoryExerciseRepository):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    goblet = exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    return squat, goblet, box


# --- GET (list both directions) ---------------------------------------------------------


def test_list_relationships_requires_authentication():
    client, _, exercises, _ = build_client()
    squat, _, _ = _catalog(exercises)

    response = client.get(f"/api/exercises/{squat.id}/relationships")

    assert response.status_code == 401


def test_list_relationships_rejects_a_verified_non_operator():
    client, ctx, exercises, _ = build_client()
    squat, _, _ = _catalog(exercises)

    response = client.get(
        f"/api/exercises/{squat.id}/relationships", headers=_normal_user(ctx)
    )

    assert response.status_code == 403


def test_list_relationships_returns_both_directions_with_kind_and_direction():
    client, ctx, exercises, relationships = build_client()
    squat, goblet, box = _catalog(exercises)
    # An outgoing Variation (box is a variation of squat) and an incoming Alternative
    # (squat is an alternative of goblet).
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(goblet.id, squat.id, RelationKind.ALTERNATIVE)

    response = client.get(
        f"/api/exercises/{squat.id}/relationships", headers=_operator(ctx)
    )

    assert response.status_code == 200
    rows = {row["id"]: row for row in response.json()["data"]}
    assert rows[box.id]["kind"] == "variation"
    assert rows[box.id]["direction"] == "outgoing"
    assert rows[box.id]["name"] == "Box Squat"
    assert rows[goblet.id]["kind"] == "alternative"
    assert rows[goblet.id]["direction"] == "incoming"


def test_list_relationships_is_empty_when_none_exist():
    client, ctx, exercises, _ = build_client()
    squat, _, _ = _catalog(exercises)

    response = client.get(
        f"/api/exercises/{squat.id}/relationships", headers=_operator(ctx)
    )

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_list_relationships_on_a_missing_exercise_returns_404():
    client, ctx, _, _ = build_client()

    response = client.get("/api/exercises/9999/relationships", headers=_operator(ctx))

    assert response.status_code == 404


# --- POST (add a link) ------------------------------------------------------------------


def test_add_relationship_requires_authentication():
    client, _, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
    )

    assert response.status_code == 401
    assert relationships.list_for(squat.id) == []


def test_add_relationship_rejects_a_verified_non_operator():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_normal_user(ctx),
    )

    assert response.status_code == 403
    assert relationships.list_for(squat.id) == []


def test_add_relationship_creates_the_link_and_returns_201():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 201
    listed = relationships.list_for(squat.id)
    assert len(listed) == 1
    assert listed[0].exercise.id == box.id
    assert listed[0].kind == RelationKind.VARIATION


def test_add_relationship_creates_no_reciprocal_link():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)

    client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    # The target carries only the incoming link — no auto reciprocal outgoing one.
    box_links = relationships.list_for(box.id)
    assert [r.direction.value for r in box_links] == ["incoming"]
    assert relationships.substitutes_for(box.id) == []


def test_add_relationship_rejects_a_self_link_with_422():
    client, ctx, exercises, relationships = build_client()
    squat, _, _ = _catalog(exercises)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": squat.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 422
    assert relationships.list_for(squat.id) == []


def test_add_relationship_rejects_a_duplicate_with_409():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 409
    # Still exactly one link — the duplicate wrote nothing.
    assert len(relationships.list_for(squat.id)) == 1


def test_add_relationship_on_a_missing_from_exercise_returns_404():
    client, ctx, exercises, _ = build_client()
    _, _, box = _catalog(exercises)

    response = client.post(
        "/api/exercises/9999/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 404


def test_add_relationship_on_a_missing_target_returns_404():
    client, ctx, exercises, relationships = build_client()
    squat, _, _ = _catalog(exercises)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": 9999, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 404
    assert relationships.list_for(squat.id) == []


def test_add_relationship_rejects_an_invalid_kind_with_422():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)

    response = client.post(
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "sibling"},
        headers=_operator(ctx),
    )

    assert response.status_code == 422
    assert relationships.list_for(squat.id) == []


# --- DELETE (remove a link) -------------------------------------------------------------


def test_remove_relationship_requires_authentication():
    client, _, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)

    response = client.request(
        "DELETE",
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
    )

    assert response.status_code == 401
    assert len(relationships.list_for(squat.id)) == 1


def test_remove_relationship_rejects_a_verified_non_operator():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)

    response = client.request(
        "DELETE",
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_normal_user(ctx),
    )

    assert response.status_code == 403
    assert len(relationships.list_for(squat.id)) == 1


def test_remove_relationship_deletes_the_link_and_returns_204():
    client, ctx, exercises, relationships = build_client()
    squat, goblet, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, goblet.id, RelationKind.ALTERNATIVE)

    response = client.request(
        "DELETE",
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 204
    remaining = {(r.exercise.id, r.kind) for r in relationships.list_for(squat.id)}
    assert remaining == {(goblet.id, RelationKind.ALTERNATIVE)}


def test_remove_relationship_is_idempotent_when_absent():
    client, ctx, exercises, relationships = build_client()
    squat, _, box = _catalog(exercises)

    response = client.request(
        "DELETE",
        f"/api/exercises/{squat.id}/relationships",
        json={"to_id": box.id, "kind": "variation"},
        headers=_operator(ctx),
    )

    # Removing a link that never existed still succeeds (idempotent) and changes nothing.
    assert response.status_code == 204
    assert relationships.list_for(squat.id) == []


def test_remove_relationship_on_a_missing_exercise_returns_404():
    client, ctx, _, _ = build_client()

    response = client.request(
        "DELETE",
        "/api/exercises/9999/relationships",
        json={"to_id": 1, "kind": "variation"},
        headers=_operator(ctx),
    )

    assert response.status_code == 404
