"""The Browse-the-Catalog endpoints end to end (ADR-0042).

``GET /api/exercises`` with a blank query lists the whole Catalog and accepts the three
facets; ``GET /api/exercises/facets`` serves the equipment options; ``GET
/api/exercises/usage`` serves the caller's per-Exercise last-performed map for the
descriptive TRAINED / NEW marker. Repositories are injected via dependency overrides so
the test runs offline."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return TestClient(app), ctx, exercises, logged


def _auth(ctx, sub="user_x"):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _listable(exercises, name, **kwargs):
    """Create a Listable catalog Exercise (description + muscle + step) with overrides."""

    base = dict(
        provenance=Provenance.CURATED,
        description="Do the thing.",
        targeted_muscles=["quads"],
        instructions=["Step one."],
    )
    base.update(kwargs)
    return exercises.find_or_create(name, **base)


# --- browse: list-all + facets ----------------------------------------------------


def test_browse_requires_authentication():
    client, _, _, _ = build_client()
    assert client.get("/api/exercises").status_code == 401


def test_blank_query_lists_the_whole_catalog():
    # Arrange — a catalog with no name query supplied
    client, ctx, exercises, _ = build_client()
    _listable(exercises, "Back Squat")
    _listable(exercises, "Bench Press", targeted_muscles=["chest"])
    exercises.find_or_create("Mystery Move", provenance=Provenance.USER_ENTERED)  # a Stub

    # Act — blank query
    response = client.get("/api/exercises", headers=_auth(ctx))

    # Assert — everything, Stub included (ADR-0042), with the full count in meta
    assert response.status_code == 200
    body = response.json()
    names = [r["name"] for r in body["data"]]
    assert set(names) == {"Back Squat", "Bench Press", "Mystery Move"}
    assert body["meta"]["total"] == 3


def test_muscle_group_facet_narrows_to_the_curated_bucket():
    client, ctx, exercises, _ = build_client()
    _listable(exercises, "Back Squat", targeted_muscles=["quads", "glutes"])
    _listable(exercises, "Bench Press", targeted_muscles=["chest"])

    response = client.get("/api/exercises?muscle_group=Legs", headers=_auth(ctx))

    names = [r["name"] for r in response.json()["data"]]
    assert names == ["Back Squat"]


def test_equipment_and_difficulty_facets_and_together():
    client, ctx, exercises, _ = build_client()
    _listable(
        exercises, "Back Squat", required_equipment=["barbell"], difficulty=6
    )
    _listable(
        exercises, "Goblet Squat", required_equipment=["dumbbell"], difficulty=3
    )

    # barbell AND intermediate band (4–7) → only the back squat
    response = client.get(
        "/api/exercises?equipment=barbell&difficulty=intermediate", headers=_auth(ctx)
    )

    names = [r["name"] for r in response.json()["data"]]
    assert names == ["Back Squat"]


def test_active_facet_excludes_name_only_stubs():
    client, ctx, exercises, _ = build_client()
    _listable(exercises, "Back Squat", targeted_muscles=["quads"])
    exercises.find_or_create("Mystery Move", provenance=Provenance.USER_ENTERED)  # Stub

    # unfiltered shows both; a muscle facet drops the Stub (it has no muscles)
    everything = client.get("/api/exercises", headers=_auth(ctx)).json()["data"]
    filtered = client.get(
        "/api/exercises?muscle_group=Legs", headers=_auth(ctx)
    ).json()["data"]
    assert len(everything) == 2
    assert [r["name"] for r in filtered] == ["Back Squat"]


def test_browse_orders_curated_then_completeness_then_name():
    client, ctx, exercises, _ = build_client()
    exercises.find_or_create("Zebra Curl", provenance=Provenance.CURATED)  # curated Stub
    _listable(exercises, "Air Squat", provenance=Provenance.CURATED)  # curated Listable
    exercises.find_or_create("Air Raise", provenance=Provenance.AI_GENERATED)  # AI Stub

    names = [
        r["name"] for r in client.get("/api/exercises", headers=_auth(ctx)).json()["data"]
    ]
    # curated Listable first, then curated Stub, then the AI Stub last
    assert names == ["Air Squat", "Zebra Curl", "Air Raise"]


def test_unrecognized_facet_values_are_ignored_not_errored():
    client, ctx, exercises, _ = build_client()
    _listable(exercises, "Back Squat", targeted_muscles=["quads"])

    # a junk muscle group is dropped, so the read behaves as if unfiltered
    response = client.get("/api/exercises?muscle_group=Elbows", headers=_auth(ctx))
    assert response.status_code == 200
    assert [r["name"] for r in response.json()["data"]] == ["Back Squat"]


# --- facets endpoint --------------------------------------------------------------


def test_facets_returns_distinct_equipment_sorted():
    client, ctx, exercises, _ = build_client()
    _listable(exercises, "Back Squat", required_equipment=["Barbell"])
    _listable(exercises, "Row", required_equipment=["barbell", "Dumbbell"])

    response = client.get("/api/exercises/facets", headers=_auth(ctx))

    assert response.status_code == 200
    assert response.json()["data"]["equipment"] == ["Barbell", "Dumbbell"]


# --- usage endpoint ---------------------------------------------------------------


def test_usage_maps_performed_exercises_to_their_latest_date():
    client, ctx, exercises, logged = build_client()
    squat = _listable(exercises, "Back Squat")
    bench = _listable(exercises, "Bench Press", targeted_muscles=["chest"])
    logged.create(
        "user_x",
        LoggedSessionDraft(
            session_id=None,
            performed_on=date(2026, 1, 5),
            training_type="strength",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id)],
        ),
    )
    logged.create(
        "user_x",
        LoggedSessionDraft(
            session_id=None,
            performed_on=date(2026, 3, 10),
            training_type="strength",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id), LoggedSetDraft(exercise_id=bench.id)],
        ),
    )

    response = client.get("/api/exercises/usage", headers=_auth(ctx))

    assert response.status_code == 200
    usage = {u["exercise_id"]: u["last_performed_on"] for u in response.json()["data"]}
    assert usage == {squat.id: "2026-03-10", bench.id: "2026-03-10"}


def test_usage_is_scoped_to_the_caller():
    client, ctx, exercises, logged = build_client()
    squat = _listable(exercises, "Back Squat")
    logged.create(
        "someone_else",
        LoggedSessionDraft(
            session_id=None,
            performed_on=date(2026, 2, 1),
            training_type="strength",
            logged_sets=[LoggedSetDraft(exercise_id=squat.id)],
        ),
    )

    response = client.get("/api/exercises/usage", headers=_auth(ctx, sub="user_x"))

    # user_x has logged nothing, so their usage map is empty — another user's logs never leak
    assert response.json()["data"] == []
