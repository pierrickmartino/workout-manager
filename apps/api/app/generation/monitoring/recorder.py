"""The ``GenerationCallRecorder`` port and its no-op default (#270/#271).

A recorder is where a ``Generation Call`` goes to be durably captured. The port is a
narrow seam so the storage backend (the Postgres audit log, ADR-0135) stays quarantined
behind it and never leaks into generators (ADR-0039).

The **no-op** records nothing. Deployments record into Postgres instead (the
``PostgresGenerationCallRecorder``, ADR-0135); the no-op stays for tests that don't care
about the log, so they run fully offline."""

from __future__ import annotations

from typing import Protocol

from app.generation.monitoring.call import GenerationCall


class GenerationCallRecorder(Protocol):
    """Durably records a metered ``Generation Call`` (the operator's usage log).

    ``flush()`` forces any batched events out. It exists because generation is async on a
    cache miss (ADR-0005): the short-lived RQ job may exit before a backend's background
    batch flushes, so the worker flushes at the end of each job or those events are lost.

    ``delete_user_traces(clerk_user_id)`` erases every ``Generation Call`` a user's prompts
    produced, keyed on the ``user_id`` stamped on each trace. It is the lifecycle capability
    that keeps holding readable health-data prompts from becoming an unbounded liability
    (ADR-0039): invokable on demand today, and ready for a future account-deletion flow.
    Unlike ``record``/``flush`` it is **not** best-effort — an erasure failure must surface
    to the caller, never be swallowed, so un-erased health data is never mistaken for erased.
    """

    def record(self, call: GenerationCall) -> None: ...

    def flush(self) -> None: ...

    def delete_user_traces(self, clerk_user_id: str) -> None: ...


class NoOpGenerationCallRecorder:
    """Records nothing — for tests that don't care about the AI audit log.

    The factory selects the Postgres recorder in deployments (ADR-0135); with this one,
    generation runs exactly as it did before monitoring. It never raises, upholding the
    best-effort guarantee."""

    def record(self, call: GenerationCall) -> None:
        return None

    def flush(self) -> None:
        return None

    def delete_user_traces(self, clerk_user_id: str) -> None:
        # Nothing was captured, so there is nothing to erase; a no-op that never
        # raises upholds the port's erasure contract.
        return None


__all__ = ["GenerationCallRecorder", "NoOpGenerationCallRecorder"]
