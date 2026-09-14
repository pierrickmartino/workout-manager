"""Admin curation endpoints: precautions, Provenance, and the audit trail (issue #503).

``PUT /api/exercises/{id}/precautions`` writes the curator-only precautions (HTML-escaped at
the boundary); ``PUT /api/exercises/{id}/provenance`` deliberately sets the Provenance tier
and writes an append-only audit record (ADR-0075); ``GET /api/exercises/{id}/audit`` reads
that trail back for an admin. These tests pin: every route is operator-only (401 / 403), the
happy paths write and return via the envelope, an invalid Provenance is 422, a missing
Exercise is 404, precautions are stored inert, a Provenance change is audited (actor +
old→new) while a descriptive edit is not, and the trail reads newest-first. Repositories are
injected via dependency overrides so the test runs offline."""

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
    return TestClient(app), ctx, exercises, audit


def _operator(ctx, sub: str = "user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def _seed(exercises: InMemoryExerciseRepository):
    return exercises.find_or_create(
        "Walking Lunge",
        provenance=Provenance.AI_GENERATED,
        description="A split-stance stride.",
    )


# --- Provenance -------------------------------------------------------------------------


def test_set_provenance_requires_authentication():
    client, _, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance", json={"provenance": "curated"}
    )

    assert response.status_code == 401


def test_set_provenance_rejects_a_verified_non_operator():
    client, ctx, exercises, audit = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "curated"},
        headers=_normal_user(ctx),
    )

    # Fails closed (ADR-0046): no change and no audit trail entry.
    assert response.status_code == 403
    assert exercises.get(exercise.id).provenance == Provenance.AI_GENERATED.value
    assert audit.list_for(exercise.id) == []


def test_set_provenance_promotes_and_returns_the_exercise():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "curated"},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert response.json()["data"]["provenance"] == Provenance.CURATED.value
    assert exercises.get(exercise.id).provenance == Provenance.CURATED.value


def test_set_provenance_writes_an_audit_record_with_actor_and_old_to_new():
    client, ctx, exercises, audit = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "curated"},
        headers=_operator(ctx, sub="user_curator"),
    )

    assert response.status_code == 200
    records = audit.list_for(exercise.id)
    assert len(records) == 1
    record = records[0]
    assert record.actor == "user_curator"
    assert record.action == AuditAction.PROVENANCE_CHANGE.value
    assert record.detail == {"from": "ai_generated", "to": "curated"}


def test_set_provenance_can_demote():
    client, ctx, exercises, audit = build_client()
    exercise = exercises.find_or_create("Front Squat", provenance=Provenance.CURATED)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "ai_generated"},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert exercises.get(exercise.id).provenance == Provenance.AI_GENERATED.value
    assert audit.list_for(exercise.id)[0].detail == {
        "from": "curated",
        "to": "ai_generated",
    }


def test_set_provenance_rejects_an_invalid_value_with_422():
    client, ctx, exercises, audit = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "gold_standard"},
        headers=_operator(ctx),
    )

    assert response.status_code == 422
    # An invalid value changes nothing and records nothing.
    assert exercises.get(exercise.id).provenance == Provenance.AI_GENERATED.value
    assert audit.list_for(exercise.id) == []


def test_setting_the_current_tier_again_is_a_no_op_that_records_nothing():
    client, ctx, exercises, audit = build_client()
    exercise = exercises.find_or_create("Front Squat", provenance=Provenance.CURATED)

    response = client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "curated"},
        headers=_operator(ctx),
    )

    # Idempotent: 200 with the tier unchanged, but the trail holds only real changes.
    assert response.status_code == 200
    assert response.json()["data"]["provenance"] == Provenance.CURATED.value
    assert audit.list_for(exercise.id) == []


def test_set_provenance_on_a_missing_exercise_returns_404():
    client, ctx, _, audit = build_client()

    response = client.put(
        "/api/exercises/9999/provenance",
        json={"provenance": "curated"},
        headers=_operator(ctx),
    )

    assert response.status_code == 404
    assert audit.list_for(9999) == []


# --- Precautions ------------------------------------------------------------------------


def test_set_precautions_requires_authentication():
    client, _, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": ["use a spotter"]},
    )

    assert response.status_code == 401


def test_set_precautions_rejects_a_verified_non_operator():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": ["use a spotter"]},
        headers=_normal_user(ctx),
    )

    assert response.status_code == 403
    assert exercises.get(exercise.id).precautions == []


def test_set_precautions_writes_the_list_and_returns_the_exercise():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": ["  stop if you feel pain  ", "warm up first"]},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    # Trimmed at the boundary, blanks dropped, order preserved.
    assert response.json()["data"]["precautions"] == [
        "stop if you feel pain",
        "warm up first",
    ]
    assert exercises.get(exercise.id).precautions == [
        "stop if you feel pain",
        "warm up first",
    ]


def test_set_precautions_drops_blank_entries():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": ["keep a neutral spine", "   ", ""]},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert response.json()["data"]["precautions"] == ["keep a neutral spine"]


def test_set_precautions_html_escapes_at_the_write_boundary():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": ["<script>alert('x')</script>"]},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    stored = exercises.get(exercise.id).precautions[0]
    # Stored inert (ADR-0036): the angle brackets and quote are escaped.
    assert "<script>" not in stored
    assert "&lt;script&gt;" in stored


def test_set_precautions_can_clear_the_list():
    client, ctx, exercises, _ = build_client()
    exercise = exercises.find_or_create(
        "Deadlift", provenance=Provenance.CURATED, precautions=["brace first"]
    )

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": []},
        headers=_operator(ctx),
    )

    assert response.status_code == 200
    assert response.json()["data"]["precautions"] == []
    assert exercises.get(exercise.id).precautions == []


def test_set_precautions_on_a_missing_exercise_returns_404():
    client, ctx, _, _ = build_client()

    response = client.put(
        "/api/exercises/9999/precautions",
        json={"precautions": ["x"]},
        headers=_operator(ctx),
    )

    assert response.status_code == 404


def test_set_precautions_rejects_a_non_list_body_with_422():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": "not a list"},
        headers=_operator(ctx),
    )

    assert response.status_code == 422


def test_setting_precautions_writes_no_audit_record():
    client, ctx, exercises, audit = build_client()
    exercise = _seed(exercises)

    client.put(
        f"/api/exercises/{exercise.id}/precautions",
        json={"precautions": ["use a spotter"]},
        headers=_operator(ctx),
    )

    # Only Provenance changes are audited (ADR-0075); editing precautions is not.
    assert audit.list_for(exercise.id) == []


def test_a_descriptive_edit_writes_no_audit_record():
    client, ctx, exercises, audit = build_client()
    exercise = _seed(exercises)

    response = client.patch(
        f"/api/exercises/{exercise.id}",
        json={"description": "A corrected split-stance stride."},
        headers=_operator(ctx),
    )

    # AC: "editing other fields does not [write an audit record]" (ADR-0075).
    assert response.status_code == 200
    assert audit.list_for(exercise.id) == []


# --- Audit read -------------------------------------------------------------------------


def test_read_audit_requires_authentication():
    client, _, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.get(f"/api/exercises/{exercise.id}/audit")

    assert response.status_code == 401


def test_read_audit_rejects_a_verified_non_operator():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.get(
        f"/api/exercises/{exercise.id}/audit", headers=_normal_user(ctx)
    )

    assert response.status_code == 403


def test_read_audit_returns_the_trail_newest_first():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "curated"},
        headers=_operator(ctx),
    )
    client.put(
        f"/api/exercises/{exercise.id}/provenance",
        json={"provenance": "ai_generated"},
        headers=_operator(ctx),
    )

    response = client.get(
        f"/api/exercises/{exercise.id}/audit", headers=_operator(ctx)
    )

    assert response.status_code == 200
    trail = response.json()["data"]
    assert len(trail) == 2
    # Newest first: the demotion (→ ai_generated) leads.
    assert trail[0]["action"] == AuditAction.PROVENANCE_CHANGE.value
    assert trail[0]["detail"] == {"from": "curated", "to": "ai_generated"}
    assert trail[1]["detail"] == {"from": "ai_generated", "to": "curated"}
    assert "created_at" in trail[0]
    assert "actor" in trail[0]


def test_read_audit_for_an_exercise_with_no_acts_is_empty():
    client, ctx, exercises, _ = build_client()
    exercise = _seed(exercises)

    response = client.get(
        f"/api/exercises/{exercise.id}/audit", headers=_operator(ctx)
    )

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_read_audit_on_a_missing_exercise_returns_404():
    client, ctx, _, _ = build_client()

    response = client.get("/api/exercises/9999/audit", headers=_operator(ctx))

    assert response.status_code == 404
