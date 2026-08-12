"""The admin-triggered Stub-enrichment backfill queue (ADR-0046).

The Stub-enrichment backfill (ADR-0041) walks the whole catalog and makes one LLM
call per fillable Stub, so it cannot run inside the HTTP request that triggers it.
This module owns the async handoff behind one small port — the same shape as the
Protocol-generation ``JobQueue`` (ADR-0005), but carrying a summary of counts rather
than an adopted ``protocol_id``:

- ``BackfillQueue.enqueue`` hands the sweep to the worker and returns a ``job_id``
  without blocking on the work.
- ``BackfillQueue.get_state`` resolves a ``job_id`` to ``Pending | Complete | Failed``
  (plus the ``EnrichmentSummary`` counts on completion), so the operator can poll.

The sweep is enqueued under one **fixed job id** (``BACKFILL_JOB_ID``): a re-trigger
while a run is still queued or in flight returns the in-flight job rather than
enqueuing a second overlapping sweep that could double-spend AI on the same Stub
(ADR-0046). ``InMemoryBackfillQueue`` runs the job only on an explicit ``work()`` call
(the test/local double); ``RqBackfillQueue`` backs the same port with Redis-Queue on
the shared ``generation`` queue in production. The real Redis/worker composition is
not unit-tested (ADR-0005)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Callable, Protocol

# The one fixed RQ job id the sweep is always enqueued under, so a double-trigger is a
# no-op (ADR-0046): a second enqueue while the first is queued/running returns it.
BACKFILL_JOB_ID = "stub-enrichment-backfill"

# The sweep can span the whole catalog with one LLM call per fillable Stub, so it needs
# far more than RQ's 180s default; and its summary should stay pollable well after it
# finishes. Both are generous on purpose — a long backfill must not be killed mid-run,
# and the operator must be able to read the counts back later.
JOB_TIMEOUT_SECONDS = 3600
RESULT_TTL_SECONDS = 86_400

# RQ statuses that mean "a run already exists and has not finished" — the window in
# which a re-trigger must return the in-flight job instead of enqueuing another.
_IN_FLIGHT_STATUSES = frozenset({"queued", "started", "deferred", "scheduled"})


class BackfillStatus(str, Enum):
    """Where a backfill run is in its lifecycle."""

    PENDING = "pending"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass(frozen=True)
class BackfillState:
    """A poll-able snapshot of a backfill run: its status and, once done, its outcome.

    ``summary`` is the ``EnrichmentSummary`` counts as a plain dict on ``COMPLETE``;
    ``error`` is a user-safe message on ``FAILED``. Both are ``None`` while ``PENDING``.
    """

    status: BackfillStatus
    summary: dict | None = None
    error: str | None = None


# A runner executes one full sweep and returns the summary counts as a plain dict.
BackfillRunner = Callable[[], dict]


class BackfillQueue(Protocol):
    """Enqueue the backfill off the request path; poll it back by id."""

    def enqueue(self) -> str: ...

    def get_state(self, job_id: str) -> BackfillState | None: ...


class InMemoryBackfillQueue:
    """A ``BackfillQueue`` double that defers the sweep to an explicit ``work()`` call.

    The enqueued run sits ``PENDING`` until ``work()`` executes it, so a test can assert
    both the immediate non-blocking handoff and the later, connection-independent
    completion. Only one run exists at a time under the fixed job id: a second
    ``enqueue`` while the first is still pending is a no-op that returns the same handle
    (the double-trigger guard, ADR-0046). A runner that raises is captured as ``FAILED``
    rather than propagating — the failure is surfaced through polling, not the enqueue.
    """

    def __init__(self, runner: BackfillRunner) -> None:
        self._runner = runner
        self._pending = False
        self._state: BackfillState | None = None

    def enqueue(self) -> str:
        # A run already in flight? Then this is a no-op that returns the same handle.
        if not self._pending:
            self._pending = True
            self._state = BackfillState(status=BackfillStatus.PENDING)
        return BACKFILL_JOB_ID

    def work(self) -> None:
        """Run the pending sweep, recording its terminal state (the worker)."""

        if not self._pending:
            return
        try:
            summary = self._runner()
            self._state = BackfillState(status=BackfillStatus.COMPLETE, summary=summary)
        except Exception as exc:  # surfaced via polling, never raised here
            self._state = BackfillState(status=BackfillStatus.FAILED, error=str(exc))
        self._pending = False

    def get_state(self, job_id: str) -> BackfillState | None:
        if job_id != BACKFILL_JOB_ID:
            return None
        return self._state


# A failed backfill must not leak the worker's traceback to the operator; the poll
# surfaces a single user-safe message.
BACKFILL_FAILED_MESSAGE = (
    "The enrichment backfill could not be completed. Please try again."
)


def state_from_rq(status: str | None, result: object) -> BackfillState:
    """Map an RQ job status to a poll-able ``BackfillState`` (pure, I/O-free).

    ``finished`` carries the ``EnrichmentSummary`` counts as the job result;
    ``failed`` is reported with a user-safe message; everything else (queued, started,
    …) is still ``PENDING``.
    """

    if status == "finished":
        summary = result if isinstance(result, dict) else None
        return BackfillState(status=BackfillStatus.COMPLETE, summary=summary)
    if status == "failed":
        return BackfillState(
            status=BackfillStatus.FAILED, error=BACKFILL_FAILED_MESSAGE
        )
    return BackfillState(status=BackfillStatus.PENDING)


class RqBackfillQueue:
    """A ``BackfillQueue`` backed by Redis Queue — the production worker handoff.

    Enqueues the module-level ``run_backfill_job`` (so the worker can import and run it)
    onto the shared ``generation`` queue under the fixed ``BACKFILL_JOB_ID``, and reads
    state back through RQ. Before enqueuing it checks for an in-flight run under that id
    and returns it unchanged, so a double-trigger never starts a second overlapping
    sweep (ADR-0046). A finished/failed run under the id is overwritten by a fresh
    enqueue, so a deliberate re-run after completion still works."""

    def __init__(self, queue) -> None:
        self._queue = queue

    def enqueue(self) -> str:
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        from app.generation.worker import run_backfill_job

        try:
            existing = Job.fetch(BACKFILL_JOB_ID, connection=self._queue.connection)
            if existing.get_status(refresh=False) in _IN_FLIGHT_STATUSES:
                return existing.id
        except NoSuchJobError:
            pass  # no prior run under this id — enqueue a fresh one below

        job = self._queue.enqueue(
            run_backfill_job,
            job_id=BACKFILL_JOB_ID,
            job_timeout=JOB_TIMEOUT_SECONDS,
            result_ttl=RESULT_TTL_SECONDS,
        )
        return job.id

    def get_state(self, job_id: str) -> BackfillState | None:
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        try:
            job = Job.fetch(job_id, connection=self._queue.connection)
        except NoSuchJobError:
            return None
        return state_from_rq(job.get_status(refresh=False), job.result)


__all__ = [
    "BACKFILL_JOB_ID",
    "BackfillStatus",
    "BackfillState",
    "BackfillQueue",
    "BackfillRunner",
    "InMemoryBackfillQueue",
    "RqBackfillQueue",
    "state_from_rq",
    "BACKFILL_FAILED_MESSAGE",
    "JOB_TIMEOUT_SECONDS",
    "RESULT_TTL_SECONDS",
]
