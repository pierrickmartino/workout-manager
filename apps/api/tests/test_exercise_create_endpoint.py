"""The resolve-or-create Exercise endpoint (ADR-0033).

``POST /api/exercises`` takes a movement name and returns the catalog Exercise it
resolves to — an existing entry by normalized-name dedup (ADR-0002), or a new
``user_entered`` one created on a miss. It is the picker's create-on-miss step for
plan-less logging (ADR-0031): the log write itself stays id-only and untouched, so
the catalog is grown here, deliberately, and never inside ``log_session``.

These tests pin: auth is required; a miss mints a ``user_entered`` entry; a hit
returns the existing entry without changing its Provenance; dedup collapses casing;
and blank or over-long names are rejected at the boundary without creating anything.
They also pin the async-on-create Enrichment trigger (issue #309): a genuine create
enqueues one Enrichment job for the new Stub, while a dedup hit or a rejected name
enqueues nothing — verified with a spy queue injected at the endpoint seam (the real
Redis/worker composition is not unit-tested, ADR-0005). Repositories and the queue
are injected via dependency overrides so the test runs offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance, normalize_name
from app.main import create_app
from app.repositories.deps import get_enrichment_queue, get_exercise_repository
from app.repositories.exercise_repository import InMemoryExerciseRepository
from tests.conftest import ISSUER, make_signing_context


class SpyEnrichmentQueue:
    """Records the Exercise ids enqueued for enrichment, running no real work.

    Standing in for ``RqEnrichmentQueue`` at the endpoint seam, it lets a test assert
    the "enqueue only on a real create, not on a dedup hit" decision without Redis."""

    def __init__(self) -> None:
        self.enqueued: list[int] = []

    def enqueue(self, exercise_id: int) -> None:
        self.enqueued.append(exercise_id)


class BrokenEnrichmentQueue:
    """An ``EnrichmentQueue`` whose enqueue always fails, standing in for Redis being
    unreachable at create time. Used to prove the enqueue is best-effort — a genuine
    create that already committed must still succeed (ADR-0002, user story 1)."""

    def enqueue(self, exercise_id: int) -> None:
        raise RuntimeError("redis is down")


def build_client(queue=None):
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    queue = queue or SpyEnrichmentQueue()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_enrichment_queue] = lambda: queue
    return TestClient(app), ctx, exercises, queue


def _auth(ctx, sub="user_x"):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def test_create_requires_authentication():
    client, _, _, _ = build_client()
    assert client.post("/api/exercises", json={"name": "Running"}).status_code == 401


def test_create_on_miss_mints_a_user_entered_exercise():
    # Arrange — an empty catalog
    client, ctx, exercises, _ = build_client()

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
    client, ctx, exercises, _ = build_client()
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
    client, ctx, exercises, _ = build_client()

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
    client, ctx, exercises, _ = build_client()

    # Act — a whitespace-only name has no normalized identity
    response = client.post(
        "/api/exercises", json={"name": "   "}, headers=_auth(ctx)
    )

    # Assert — rejected at the boundary, nothing minted
    assert response.status_code == 422
    assert exercises.list_by_provenance(Provenance.USER_ENTERED) == []


def test_create_rejects_an_over_long_name():
    # Arrange
    client, ctx, exercises, _ = build_client()

    # Act — a name past the sane cap (a junk paste, not a movement)
    response = client.post(
        "/api/exercises", json={"name": "x" * 200}, headers=_auth(ctx)
    )

    # Assert — rejected, and nothing entered the shared catalog
    assert response.status_code == 422
    assert exercises.search(normalize_name("x" * 200), limit=5, offset=0).total == 0


def test_create_on_miss_enqueues_one_enrichment_job_for_the_new_stub():
    # Arrange — an empty catalog
    client, ctx, _, queue = build_client()

    # Act — the picker mints a brand-new movement
    response = client.post(
        "/api/exercises", json={"name": "Jefferson Curl"}, headers=_auth(ctx)
    )

    # Assert — exactly one Enrichment job, carrying the new Stub's own id, so a worker
    # fills its fields out-of-band (issue #309, ADR-0041). The response is unchanged.
    assert response.status_code == 200
    new_id = response.json()["data"]["id"]
    assert queue.enqueued == [new_id]


def test_create_on_a_dedup_hit_enqueues_nothing():
    # Arrange — the movement already exists, so nothing new enters the catalog
    client, ctx, exercises, queue = build_client()
    exercises.find_or_create("Running", provenance=Provenance.CURATED)

    # Act — a create that resolves to the existing entry (ADR-0002 dedup)
    response = client.post(
        "/api/exercises", json={"name": "running"}, headers=_auth(ctx)
    )

    # Assert — an existing movement is never re-enriched by this path: no enqueue
    assert response.status_code == 200
    assert queue.enqueued == []


def test_repeated_create_enqueues_only_on_the_first_real_create():
    # Arrange
    client, ctx, _, queue = build_client()

    # Act — the same movement is "created" twice (the second is a dedup hit)
    first = client.post(
        "/api/exercises", json={"name": "Box Jump"}, headers=_auth(ctx)
    )
    client.post("/api/exercises", json={"name": "  box jump "}, headers=_auth(ctx))

    # Assert — one enqueue total, for the single row that was actually minted
    assert queue.enqueued == [first.json()["data"]["id"]]


def test_a_rejected_name_enqueues_nothing():
    # Arrange
    client, ctx, _, queue = build_client()

    # Act — a blank name is rejected at the boundary before any create
    response = client.post(
        "/api/exercises", json={"name": "   "}, headers=_auth(ctx)
    )

    # Assert — nothing minted, nothing enqueued
    assert response.status_code == 422
    assert queue.enqueued == []


def test_create_succeeds_even_when_the_enrichment_enqueue_fails():
    # Arrange — the enrichment queue is unreachable (e.g. Redis down)
    ctx = make_signing_context()
    client, ctx, exercises, _ = build_client(queue=BrokenEnrichmentQueue())

    # Act — a genuine create whose out-of-band enqueue will raise
    response = client.post(
        "/api/exercises", json={"name": "Jefferson Curl"}, headers=_auth(ctx)
    )

    # Assert — enrichment is best-effort: the create (already committed) still
    # succeeds and returns the movement, so frictionless logging is never blocked by
    # an enqueue failure (user story 1). The movement can be lifted later by the
    # backfill, which is idempotent-friendly.
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Jefferson Curl"
    assert exercises.get(data["id"]).name == "Jefferson Curl"
