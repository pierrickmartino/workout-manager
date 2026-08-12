"""The admin-triggered Stub-enrichment backfill endpoint (ADR-0046).

``POST /api/exercises/enrichment-backfill`` hands a whole-catalog Stub-enrichment
sweep to the background worker and returns a ``202`` handle;
``GET …/enrichment-backfill/jobs/{job_id}`` polls it back. These tests pin: both
routes are operator-only (401 unauthenticated, 403 for a verified non-operator); a
trigger enqueues off the request path and returns a pending ``job_id`` without running
the sweep; polling surfaces the EnrichmentSummary counts once the worker finishes; a
double-trigger runs the sweep only once (the fixed-job-id guard); and an unknown job id
is 404. The queue is injected as an in-memory double so the sweep runs on an explicit
``work()`` — offline, no Redis, no LLM (ADR-0005)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.backfill_queue import BACKFILL_JOB_ID, InMemoryBackfillQueue
from app.main import create_app
from app.repositories.deps import get_backfill_queue
from tests.conftest import ISSUER, make_signing_context

_SUMMARY = {
    "enriched": 4,
    "skipped_already_complete": 2,
    "skipped_nothing_to_work_from": 1,
    "skipped_unfillable": 0,
}


def build_client(runner=None):
    ctx = make_signing_context()
    calls = {"n": 0}

    def default_runner() -> dict:
        calls["n"] += 1
        return _SUMMARY

    queue = InMemoryBackfillQueue(runner or default_runner)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_backfill_queue] = lambda: queue
    return TestClient(app), ctx, queue, calls


def _operator(ctx):
    return {"Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'admin'})}"}


def _normal_user(ctx):
    return {"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"}


def test_trigger_requires_authentication():
    client, _, _, _ = build_client()
    assert client.post("/api/exercises/enrichment-backfill").status_code == 401


def test_trigger_rejects_a_verified_non_operator():
    # Arrange
    client, ctx, _, calls = build_client()

    # Act — a normal signed-in user tries to run the AI batch
    response = client.post(
        "/api/exercises/enrichment-backfill", headers=_normal_user(ctx)
    )

    # Assert — fails closed (403), and nothing was enqueued
    assert response.status_code == 403
    assert calls["n"] == 0


def test_trigger_enqueues_off_the_request_path_and_returns_a_pending_handle():
    # Arrange
    client, ctx, _, calls = build_client()

    # Act — an operator triggers the backfill
    response = client.post("/api/exercises/enrichment-backfill", headers=_operator(ctx))

    # Assert — 202 with a pending job_id, and the sweep has NOT run inline (no LLM on
    # the request path)
    assert response.status_code == 202
    data = response.json()["data"]
    assert data["status"] == "pending"
    assert data["job_id"] == BACKFILL_JOB_ID
    assert data["summary"] is None
    assert calls["n"] == 0


def test_polling_surfaces_the_summary_counts_once_the_worker_finishes():
    # Arrange — an operator triggers, then the worker runs the deferred sweep
    client, ctx, queue, _ = build_client()
    job_id = client.post(
        "/api/exercises/enrichment-backfill", headers=_operator(ctx)
    ).json()["data"]["job_id"]
    queue.work()

    # Act — the operator polls the run
    response = client.get(
        f"/api/exercises/enrichment-backfill/jobs/{job_id}", headers=_operator(ctx)
    )

    # Assert — complete, with the enriched/skipped counts pollable
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "complete"
    assert data["summary"] == _SUMMARY
    assert data["error"] is None


def test_polling_is_operator_only():
    # Arrange
    client, ctx, _, _ = build_client()
    client.post("/api/exercises/enrichment-backfill", headers=_operator(ctx))

    # Act / Assert — a normal user cannot read the maintenance job either
    unauth = client.get(f"/api/exercises/enrichment-backfill/jobs/{BACKFILL_JOB_ID}")
    forbidden = client.get(
        f"/api/exercises/enrichment-backfill/jobs/{BACKFILL_JOB_ID}",
        headers=_normal_user(ctx),
    )
    assert unauth.status_code == 401
    assert forbidden.status_code == 403


def test_a_double_trigger_runs_the_sweep_only_once():
    # Arrange
    client, ctx, queue, calls = build_client()

    # Act — the operator triggers twice before the worker runs, then the worker runs
    first = client.post(
        "/api/exercises/enrichment-backfill", headers=_operator(ctx)
    ).json()["data"]["job_id"]
    second = client.post(
        "/api/exercises/enrichment-backfill", headers=_operator(ctx)
    ).json()["data"]["job_id"]
    queue.work()

    # Assert — one shared handle, one sweep — no overlapping double-spend (ADR-0046)
    assert first == second == BACKFILL_JOB_ID
    assert calls["n"] == 1


def test_polling_an_unknown_job_id_is_404():
    # Arrange — nothing enqueued
    client, ctx, _, _ = build_client()

    # Act / Assert — an id this queue never issued is not found
    response = client.get(
        "/api/exercises/enrichment-backfill/jobs/does-not-exist",
        headers=_operator(ctx),
    )
    assert response.status_code == 404
