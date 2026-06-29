"""The async job queue port (Slice 7, ADR-0005).

The ``JobQueue`` moves generation off the request path: a submit *enqueues* work
and returns a handle immediately; a separate worker runs it later and the result
is retrievable by id. ``InMemoryJobQueue`` is the test/local double — it records
enqueued jobs as ``PENDING`` and only runs them when ``work()`` is called, so a
test can observe the non-blocking handoff *and* the later completion, exactly the
property that keeps a dropped mobile connection from losing a long generation.
"""

from __future__ import annotations

from app.generation.job_queue import (
    GENERATION_FAILED_MESSAGE,
    InMemoryJobQueue,
    JobStatus,
    RqJobQueue,
    state_from_rq,
)
from app.generation.program_generator import ProgramGenerationRequest


def test_enqueue_returns_a_handle_without_running_the_job():
    # Arrange — a runner that records whether it has been invoked
    ran: list[str] = []

    def runner(request, clerk_user_id, cache_key):
        ran.append(clerk_user_id)
        return 7

    queue = InMemoryJobQueue(runner)

    # Act — enqueue, but do not work the queue
    job_id = queue.enqueue("req", "user_a", "genprog:key")

    # Assert — a handle is returned and the work has NOT happened yet
    assert job_id
    assert ran == []
    assert queue.get_state(job_id).status is JobStatus.PENDING


def test_worked_job_completes_and_is_retrievable_by_id():
    # Arrange
    def runner(request, clerk_user_id, cache_key):
        return 42

    queue = InMemoryJobQueue(runner)
    job_id = queue.enqueue("req", "user_a", "genprog:key")

    # Act — the worker runs independently of the original request
    queue.work()

    # Assert — the result survives and is retrievable by the handle alone
    state = queue.get_state(job_id)
    assert state.status is JobStatus.COMPLETE
    assert state.program_id == 42


def test_a_failing_generation_is_surfaced_as_a_failed_state():
    # Arrange — a runner that fails the way a malformed generation would
    def runner(request, clerk_user_id, cache_key):
        raise RuntimeError("the program could not be generated")

    queue = InMemoryJobQueue(runner)
    job_id = queue.enqueue("req", "user_a", None)

    # Act — working the queue must not raise; the failure is captured
    queue.work()

    # Assert — polling reports FAILED with a message, never an exception
    state = queue.get_state(job_id)
    assert state.status is JobStatus.FAILED
    assert "could not be generated" in state.error


def test_unknown_job_id_has_no_state():
    queue = InMemoryJobQueue(lambda *_: 1)

    assert queue.get_state("nope") is None


def test_rq_status_maps_finished_to_complete_with_the_program_id():
    state = state_from_rq("finished", 99)

    assert state.status is JobStatus.COMPLETE
    assert state.program_id == 99


def test_rq_status_maps_failed_to_a_user_safe_message():
    state = state_from_rq("failed", None)

    assert state.status is JobStatus.FAILED
    assert state.error == GENERATION_FAILED_MESSAGE


def test_rq_in_flight_statuses_are_pending():
    for status in ("queued", "started", "deferred", "scheduled"):
        assert state_from_rq(status, None).status is JobStatus.PENDING


class _FakeRqJob:
    def __init__(self, job_id: str) -> None:
        self.id = job_id


class _FakeRqQueue:
    """Mimics rq.Queue.enqueue: records the call and returns a job with an id."""

    def __init__(self) -> None:
        self.enqueued: tuple | None = None
        self.connection = object()

    def enqueue(self, func, *args):
        self.enqueued = (func, args)
        return _FakeRqJob("job-abc")


def test_rq_queue_enqueues_the_worker_function_with_serialized_args():
    # Arrange — the production queue over a Redis-Queue-shaped double
    from app.generation.worker import run_generation_job

    queue = _FakeRqQueue()
    request = ProgramGenerationRequest(
        training_type="strength",
        objective="gain muscle mass",
        sessions_per_week=1,
        duration_minutes=45,
        weeks=1,
        equipment=["barbell"],
    )

    # Act
    job_id = RqJobQueue(queue).enqueue(request, "user_a", "genprog:key")

    # Assert — the importable worker fn is enqueued with a plain dict (not the
    # dataclass), the user, and the cache key; the rq job id is returned
    assert job_id == "job-abc"
    func, args = queue.enqueued
    assert func is run_generation_job
    payload, user_id, cache_key = args
    assert payload == {
        "training_type": "strength",
        "objective": "gain muscle mass",
        "sessions_per_week": 1,
        "duration_minutes": 45,
        "weeks": 1,
        "equipment": ["barbell"],
    }
    assert user_id == "user_a"
    assert cache_key == "genprog:key"
