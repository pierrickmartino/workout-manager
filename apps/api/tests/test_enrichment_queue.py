"""The async enrichment queue port (issue #309, ADR-0005/0041).

When ``POST /api/exercises`` mints a new Stub on a genuine miss, an Enrichment job
is enqueued on the existing RQ ``generation`` queue so a worker fills the movement's
fields out-of-band — the synchronous create stays a pure name-only insert (ADR-0002).
The port is deliberately fire-and-forget: unlike Protocol generation there is no
handle to poll, because the user keeps logging immediately and the enrichment simply
appears later.

The real Redis/worker composition is not unit-tested (ADR-0005); what is pinned here
is that ``RqEnrichmentQueue`` enqueues the importable worker function with the
Exercise id, over a Redis-Queue-shaped double."""

from __future__ import annotations

from app.generation.enrichment_queue import RqEnrichmentQueue


class _FakeRqJob:
    def __init__(self, job_id: str) -> None:
        self.id = job_id


class _FakeRqQueue:
    """Mimics rq.Queue.enqueue: records the call and returns a job with an id."""

    def __init__(self) -> None:
        self.enqueued: tuple | None = None

    def enqueue(self, func, *args):
        self.enqueued = (func, args)
        return _FakeRqJob("job-enrich-1")


def test_rq_enrichment_queue_enqueues_the_worker_function_with_the_exercise_id():
    # Arrange — the production queue over a Redis-Queue-shaped double
    from app.generation.worker import run_enrichment_job

    queue = _FakeRqQueue()

    # Act — enqueue enrichment for a freshly minted Stub
    RqEnrichmentQueue(queue).enqueue(42)

    # Assert — the importable worker fn is enqueued with the Exercise id alone, so a
    # separate worker process can import and run it (ADR-0005).
    func, args = queue.enqueued
    assert func is run_enrichment_job
    assert args == (42,)
