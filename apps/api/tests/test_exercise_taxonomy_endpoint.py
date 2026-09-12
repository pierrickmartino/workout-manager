"""The Catalog Movement Pattern taxonomy endpoint end to end (ADR-0072).

``GET /api/exercises/taxonomy`` groups the whole filtered Catalog by broad Movement
Pattern, in canonical order with accurate per-pattern counts. It shares the browse
facets, so the same query + Muscle Group / equipment / difficulty narrowing applies.
Repositories are injected via dependency overrides so the test runs offline."""

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


def _listable(exercises, name, **kwargs):
    base = dict(
        provenance=Provenance.CURATED,
        description="Do the thing.",
        targeted_muscles=["quads"],
        instructions=["Step one."],
    )
    base.update(kwargs)
    return exercises.find_or_create(name, **base)


def test_taxonomy_requires_authentication():
    client, _, _ = build_client()
    assert client.get("/api/exercises/taxonomy").status_code == 401


def test_groups_catalog_by_movement_pattern_in_canonical_order():
    # Arrange — one movement per family, added out of canonical order
    client, ctx, exercises = build_client()
    _listable(exercises, "Pull-Up", targeted_muscles=["lats"])
    _listable(exercises, "Barbell Back Squat", targeted_muscles=["quads"])
    _listable(exercises, "Plank", targeted_muscles=["abdominals"])
    _listable(exercises, "Bench Press", targeted_muscles=["chest"])

    # Act
    response = client.get("/api/exercises/taxonomy", headers=_auth(ctx))

    # Assert — canonical pattern order (squat, push, pull, core), each with its exercise
    assert response.status_code == 200
    body = response.json()
    patterns = [group["pattern"] for group in body["data"]["groups"]]
    assert patterns == ["squat", "push", "pull", "core"]
    squat = body["data"]["groups"][0]
    assert squat["count"] == 1
    assert squat["exercises"][0]["name"] == "Barbell Back Squat"
    assert squat["exercises"][0]["movement_pattern"] == "squat"
    assert body["meta"]["total"] == 4


def test_counts_reflect_every_matching_exercise_not_a_page():
    # Arrange — more squats than a single browse page would return (default 20)
    client, ctx, exercises = build_client()
    for index in range(25):
        _listable(exercises, f"Squat Variant {index}", targeted_muscles=["quads"])

    # Act
    response = client.get("/api/exercises/taxonomy", headers=_auth(ctx))

    # Assert — the whole filtered set is grouped, so the count is accurate (not capped at 20)
    squat = response.json()["data"]["groups"][0]
    assert squat["pattern"] == "squat"
    assert squat["count"] == 25
    assert len(squat["exercises"]) == 25


def test_facets_narrow_the_taxonomy():
    # Arrange
    client, ctx, exercises = build_client()
    _listable(exercises, "Barbell Back Squat", targeted_muscles=["quads"], required_equipment=["barbell"])
    _listable(exercises, "Goblet Squat", targeted_muscles=["quads"], required_equipment=["dumbbell"])

    # Act — filter to dumbbell only
    response = client.get("/api/exercises/taxonomy?equipment=dumbbell", headers=_auth(ctx))

    # Assert — one squat group with only the dumbbell movement
    groups = response.json()["data"]["groups"]
    assert len(groups) == 1
    assert groups[0]["count"] == 1
    assert groups[0]["exercises"][0]["name"] == "Goblet Squat"


def test_unclassifiable_movement_lands_in_general_bucket_last():
    client, ctx, exercises = build_client()
    _listable(exercises, "Barbell Back Squat", targeted_muscles=["quads"])
    _listable(exercises, "Mystery Drill", targeted_muscles=[])

    response = client.get("/api/exercises/taxonomy", headers=_auth(ctx))

    patterns = [group["pattern"] for group in response.json()["data"]["groups"]]
    assert patterns == ["squat", "general"]


def test_empty_catalog_yields_no_groups():
    client, ctx, _ = build_client()
    response = client.get("/api/exercises/taxonomy", headers=_auth(ctx))
    body = response.json()
    assert body["data"]["groups"] == []
    assert body["meta"]["total"] == 0
