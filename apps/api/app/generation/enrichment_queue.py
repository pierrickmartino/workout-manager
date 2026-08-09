"""The async Stub-enrichment queue port (issue #309, ADR-0005/0041).

When ``POST /api/exercises`` mints a *new* Stub on a genuine normalized-name miss,
the movement is enriched out-of-band: the synchronous write stays a pure name-only
insert with no AI call (ADR-0002), and an Enrichment job is enqueued so a background
worker fills the fields later, following the same async-on-cache-miss handoff as
Protocol generation (ADR-0005). This module owns that handoff behind one small port:

- ``EnrichmentQueue.enqueue`` accepts the new Stub's id and returns immediately,
  never blocking the create response on an AI call.

Unlike ``JobQueue`` the port is deliberately **fire-and-forget** — there is no handle
to poll and no result to fetch, because the user keeps logging the moment the Stub is
created and the enriched fields simply appear on the movement later. ``RqEnrichmentQueue``
backs the port with Redis-Queue on the existing shared ``generation`` queue so
enrichment and Protocol generation ride one Redis (ADR-0005). Tests inject a fake/spy
at the endpoint seam; the real Redis/worker composition is not unit-tested."""

from __future__ import annotations

from typing import Protocol


class EnrichmentQueue(Protocol):
    """Enqueue Stub enrichment off the create path; fire-and-forget."""

    def enqueue(self, exercise_id: int) -> None: ...


class RqEnrichmentQueue:
    """An ``EnrichmentQueue`` backed by Redis Queue — the production worker handoff.

    Enqueues the module-level ``run_enrichment_job`` (so the worker process can import
    and run it) onto the shared ``generation`` queue, carrying only the new Stub's id.
    The returned RQ job is discarded: enrichment is fire-and-forget, so there is
    nothing for the caller to poll."""

    def __init__(self, queue) -> None:
        self._queue = queue

    def enqueue(self, exercise_id: int) -> None:
        from app.generation.worker import run_enrichment_job

        self._queue.enqueue(run_enrichment_job, exercise_id)


__all__ = ["EnrichmentQueue", "RqEnrichmentQueue"]
