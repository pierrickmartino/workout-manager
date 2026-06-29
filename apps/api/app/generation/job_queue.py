"""The async generation job queue (Slice 7, ADR-0005).

A cache miss must not hold the HTTP connection open for a long multi-week
generation — fragile on the mobile-first PWA where connections drop. Instead the
work is *enqueued* and the request returns a handle; a worker runs the job later
and the result is retrievable by id. This module owns that handoff behind one
small port:

- ``JobQueue.enqueue`` accepts a generation request and returns a ``job_id``
  without blocking on the work.
- ``JobQueue.get_state`` resolves a ``job_id`` to ``Pending | Complete | Failed``
  (plus the adopted ``program_id`` on completion), so the PWA can poll.

``InMemoryJobQueue`` runs jobs only on an explicit ``work()`` call (the test/local
double), while ``RqJobQueue`` backs the same port with Redis-Queue in production
so the generation cache and the queue share one Redis (ADR-0005).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Callable, Protocol


class JobStatus(str, Enum):
    """Where a generation job is in its lifecycle."""

    PENDING = "pending"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass(frozen=True)
class JobState:
    """A poll-able snapshot of a job: its status and, once done, its outcome.

    ``program_id`` is the adopted user-owned Program on ``COMPLETE``; ``error`` is
    a user-safe message on ``FAILED``. Both are ``None`` while ``PENDING``.
    """

    status: JobStatus
    program_id: int | None = None
    error: str | None = None


# A runner turns the enqueued arguments into the adopted Program's id.
GenerationRunner = Callable[[object, str, str | None], int]


class JobQueue(Protocol):
    """Enqueue generation off the request path; poll it back by id."""

    def enqueue(
        self, request: object, clerk_user_id: str, cache_key: str | None
    ) -> str: ...

    def get_state(self, job_id: str) -> JobState | None: ...


class InMemoryJobQueue:
    """A ``JobQueue`` double that defers work to an explicit ``work()`` call.

    Enqueued jobs sit ``PENDING`` until ``work()`` runs them, so a test can assert
    both the immediate non-blocking handoff and the later, connection-independent
    completion. A runner that raises is captured as ``FAILED`` rather than
    propagating — the failure is surfaced through polling, not the enqueue.
    """

    def __init__(self, runner: GenerationRunner) -> None:
        self._runner = runner
        self._counter = 0
        self._pending: dict[str, tuple[object, str, str | None]] = {}
        self._states: dict[str, JobState] = {}

    def enqueue(
        self, request: object, clerk_user_id: str, cache_key: str | None
    ) -> str:
        self._counter += 1
        job_id = f"job-{self._counter}"
        self._pending[job_id] = (request, clerk_user_id, cache_key)
        self._states[job_id] = JobState(status=JobStatus.PENDING)
        return job_id

    def work(self) -> None:
        """Run every pending job, recording its terminal state (the worker)."""

        for job_id, (request, clerk_user_id, cache_key) in list(self._pending.items()):
            try:
                program_id = self._runner(request, clerk_user_id, cache_key)
                self._states[job_id] = JobState(
                    status=JobStatus.COMPLETE, program_id=program_id
                )
            except Exception as exc:  # surfaced via polling, never raised here
                self._states[job_id] = JobState(
                    status=JobStatus.FAILED, error=str(exc)
                )
            del self._pending[job_id]

    def get_state(self, job_id: str) -> JobState | None:
        return self._states.get(job_id)


# A failed generation must not leak the worker's traceback to the client; the
# poll surfaces a single user-safe message (mirrors the old synchronous 502).
GENERATION_FAILED_MESSAGE = "The program could not be generated. Please try again."


def state_from_rq(status: str | None, result: object) -> JobState:
    """Map an RQ job status to a poll-able ``JobState`` (pure, I/O-free).

    ``finished`` carries the adopted Program id as the job result; ``failed`` is
    reported with a user-safe message; everything else (queued, started, …) is
    still ``PENDING`` from the PWA's point of view.
    """

    if status == "finished":
        program_id = result if isinstance(result, int) else None
        return JobState(status=JobStatus.COMPLETE, program_id=program_id)
    if status == "failed":
        return JobState(status=JobStatus.FAILED, error=GENERATION_FAILED_MESSAGE)
    return JobState(status=JobStatus.PENDING)


class RqJobQueue:
    """A ``JobQueue`` backed by Redis Queue — the production worker handoff.

    Enqueues the module-level ``run_generation_job`` (so the worker process can
    import and run it) and reads job state back through RQ, which stores both on
    the same Redis that backs the Generation Cache (ADR-0005).
    """

    def __init__(self, queue) -> None:
        self._queue = queue

    def enqueue(
        self, request: object, clerk_user_id: str, cache_key: str | None
    ) -> str:
        from app.generation.worker import request_payload, run_generation_job

        job = self._queue.enqueue(
            run_generation_job,
            request_payload(request),
            clerk_user_id,
            cache_key,
        )
        return job.id

    def get_state(self, job_id: str) -> JobState | None:
        from rq.exceptions import NoSuchJobError
        from rq.job import Job

        try:
            job = Job.fetch(job_id, connection=self._queue.connection)
        except NoSuchJobError:
            return None
        return state_from_rq(job.get_status(refresh=False), job.result)


__all__ = [
    "JobStatus",
    "JobState",
    "JobQueue",
    "InMemoryJobQueue",
    "RqJobQueue",
    "GenerationRunner",
    "state_from_rq",
    "GENERATION_FAILED_MESSAGE",
]
