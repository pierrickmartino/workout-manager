"""The admin-triggered backfill queue port (ADR-0046).

These tests pin the offline-testable seams — the pure RQ-status mapper and the
in-memory double (the real Redis/worker composition is not unit-tested, ADR-0005):
the non-blocking handoff leaves a run PENDING until the worker runs it, completion
carries the EnrichmentSummary counts back for polling, a failing sweep is surfaced as
FAILED through the poll rather than raised at enqueue, and — the double-trigger guard —
a second enqueue while a run is still in flight is a no-op that runs the sweep only
once."""

from __future__ import annotations

from app.generation.backfill_queue import (
    BACKFILL_JOB_ID,
    BackfillStatus,
    InMemoryBackfillQueue,
    state_from_rq,
)


def test_enqueue_hands_off_without_running_and_reports_pending():
    # Arrange — a runner that records whether it was called
    calls = {"n": 0}

    def runner() -> dict:
        calls["n"] += 1
        return {"enriched": 3}

    queue = InMemoryBackfillQueue(runner)

    # Act — enqueue hands off the sweep
    job_id = queue.enqueue()

    # Assert — the run is pending and the sweep has NOT run on the request path
    assert job_id == BACKFILL_JOB_ID
    assert calls["n"] == 0
    assert queue.get_state(job_id).status is BackfillStatus.PENDING


def test_work_completes_and_carries_the_summary_counts_back():
    # Arrange
    summary = {
        "enriched": 5,
        "skipped_already_complete": 2,
        "skipped_nothing_to_work_from": 0,
        "skipped_unfillable": 1,
    }
    queue = InMemoryBackfillQueue(lambda: summary)
    job_id = queue.enqueue()

    # Act — the worker runs the deferred sweep
    queue.work()

    # Assert — complete, with the counts pollable for the operator
    state = queue.get_state(job_id)
    assert state.status is BackfillStatus.COMPLETE
    assert state.summary == summary
    assert state.error is None


def test_a_failing_sweep_is_surfaced_as_failed_not_raised():
    # Arrange — a runner that blows up mid-sweep
    def runner() -> dict:
        raise RuntimeError("llm exploded")

    queue = InMemoryBackfillQueue(runner)
    queue.enqueue()

    # Act — work() captures the failure rather than propagating it
    queue.work()

    # Assert — the failure is reported through polling, never at enqueue
    state = queue.get_state(BACKFILL_JOB_ID)
    assert state.status is BackfillStatus.FAILED
    assert state.summary is None


def test_a_second_enqueue_while_in_flight_is_a_no_op():
    # Arrange — a runner counting how many sweeps actually run
    calls = {"n": 0}

    def runner() -> dict:
        calls["n"] += 1
        return {"enriched": 1}

    queue = InMemoryBackfillQueue(runner)

    # Act — an operator (or a double-click) triggers twice before the worker runs
    first = queue.enqueue()
    second = queue.enqueue()
    queue.work()

    # Assert — one shared handle, one sweep — no overlapping double-spend (ADR-0046)
    assert first == second == BACKFILL_JOB_ID
    assert calls["n"] == 1


def test_work_with_nothing_pending_is_a_no_op():
    # Arrange — a queue that was never triggered
    calls = {"n": 0}
    queue = InMemoryBackfillQueue(lambda: calls.__setitem__("n", calls["n"] + 1))

    # Act — the worker wakes with no run to do
    queue.work()

    # Assert — nothing ran and there is no state to poll
    assert calls["n"] == 0
    assert queue.get_state(BACKFILL_JOB_ID) is None


def test_get_state_is_none_for_an_unknown_job_id():
    # Arrange — nothing enqueued
    queue = InMemoryBackfillQueue(lambda: {})

    # Act / Assert — an id that was never this queue's run resolves to nothing
    assert queue.get_state("some-other-id") is None


def test_state_from_rq_maps_finished_to_complete_with_summary():
    # Arrange
    result = {"enriched": 4, "skipped_already_complete": 1}

    # Act
    state = state_from_rq("finished", result)

    # Assert — a finished RQ job carries its summary result through
    assert state.status is BackfillStatus.COMPLETE
    assert state.summary == result


def test_state_from_rq_maps_failed_to_a_user_safe_message():
    # Act — a failed RQ job never leaks the worker traceback (result is the exc)
    state = state_from_rq("failed", ValueError("boom"))

    # Assert
    assert state.status is BackfillStatus.FAILED
    assert state.summary is None
    assert "backfill" in state.error.lower()


def test_state_from_rq_maps_in_progress_statuses_to_pending():
    # Act / Assert — queued and started both read as pending to the operator
    assert state_from_rq("queued", None).status is BackfillStatus.PENDING
    assert state_from_rq("started", None).status is BackfillStatus.PENDING
