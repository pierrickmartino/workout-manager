"""The admin per-Exercise "enrich now" endpoint (issue #508, ADR-0041/0046).

``POST /api/exercises/{id}/enrich`` lets an operator enqueue Enrichment for one
catalog Exercise directly from its editor, reusing the same out-of-band Enrichment
path the create flow uses (issue #309) — no AI runs on the request. These tests pin:
the route is operator-only (401 unauthenticated, 403 for a verified non-operator); a
genuine enrich enqueues exactly the target Exercise's id and returns ``202``; a
missing Exercise is ``404`` and enqueues nothing. The queue is injected as a spy at the
endpoint seam, so the test runs offline with no Redis or LLM (ADR-0005)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import get_enrichment_queue, get_exercise_repository
from app.repositories.exercise_repository import InMemoryExerciseRepository
from tests.conftest import ISSUER, make_signing_context


class SpyEnrichmentQueue:
    """Records the Exercise ids enqueued for enrichment, running no real work.

    Standing in for ``RqEnrichmentQueue`` at the endpoint seam, it lets a test assert
    which movement the enrich-now trigger enqueued without Redis or the worker."""

    def __init__(self) -> None:
        self.enqueued: list[int] = []

    def enqueue(self, exercise_id: int) -> None:
        self.enqueued.append(exercise_id)


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    queue = SpyEnrichmentQueue()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_enrichment_queue] = lambda: queue
    return TestClient(app), ctx, exercises, queue


def _operator(ctx):
    return {"Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'admin'})}"}


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def test_enrich_requires_authentication():
    client, _, exercises, queue = build_client()
    seeded = exercises.find_or_create("Cossack Squat", provenance=Provenance.USER_ENTERED)

    assert client.post(f"/api/exercises/{seeded.id}/enrich").status_code == 401
    assert queue.enqueued == []


def test_enrich_rejects_a_verified_non_operator():
    # Arrange — a normal signed-in user and an existing Stub
    client, ctx, exercises, queue = build_client()
    seeded = exercises.find_or_create("Cossack Squat", provenance=Provenance.USER_ENTERED)

    # Act — a non-operator tries to trigger a single-row enrichment
    response = client.post(
        f"/api/exercises/{seeded.id}/enrich", headers=_normal_user(ctx)
    )

    # Assert — fails closed (403), and nothing was enqueued
    assert response.status_code == 403
    assert queue.enqueued == []


def test_enrich_enqueues_the_target_and_returns_202():
    # Arrange — an existing Stub the operator wants filled now
    client, ctx, exercises, queue = build_client()
    seeded = exercises.find_or_create("Cossack Squat", provenance=Provenance.USER_ENTERED)

    # Act — the operator triggers enrich-now from the editor
    response = client.post(
        f"/api/exercises/{seeded.id}/enrich", headers=_operator(ctx)
    )

    # Assert — 202 accepted, and exactly one Enrichment job carrying this Exercise's id,
    # so a worker fills it out-of-band (no AI on the request path).
    assert response.status_code == 202
    assert response.json()["data"]["exercise_id"] == seeded.id
    assert queue.enqueued == [seeded.id]


def test_enrich_a_missing_exercise_is_404_and_enqueues_nothing():
    # Arrange — an empty catalog
    client, ctx, _, queue = build_client()

    # Act — enrich an id that does not exist
    response = client.post("/api/exercises/9999/enrich", headers=_operator(ctx))

    # Assert — 404, and no job was enqueued for a movement that isn't there
    assert response.status_code == 404
    assert queue.enqueued == []
