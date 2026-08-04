"""The ``GenerationCallRecorder`` port and its no-op default (#270/#271).

A recorder is where a ``Generation Call`` goes to be durably captured. The port is a
one-method seam so the observability vendor (self-hosted Langfuse, a later slice) stays
quarantined behind it and never leaks into generators (ADR-0039).

The default is a **no-op**: an unconfigured deployment — and the entire offline test
suite — records nothing and stays fully offline, so generation behaves exactly as it did
before monitoring existed."""

from __future__ import annotations

from typing import Protocol

from app.generation.monitoring.call import GenerationCall


class GenerationCallRecorder(Protocol):
    """Durably records a metered ``Generation Call`` (the operator's usage log).

    ``record`` returns an optional **trace-id handle** — the backend's durable id for the
    call. It is the lineage stored on the Generated artifact and carried along the
    adopt/regeneration chain (#274), so a later fast-follow can push Generation Feedback
    back to the exact call. A backend with no notion of a trace id (the no-op) returns
    ``None`` and lineage is simply absent, never an error.

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

    def record(self, call: GenerationCall) -> str | None: ...

    def flush(self) -> None: ...

    def delete_user_traces(self, clerk_user_id: str) -> None: ...


class NoOpGenerationCallRecorder:
    """Records nothing — the default when no monitoring backend is configured.

    Selected by the factory for any deployment without Langfuse and used by the whole
    offline suite, so generation runs exactly as it did before monitoring. It never
    raises, upholding the best-effort guarantee even on the default path, and returns no
    trace-id handle — lineage is simply absent on the unconfigured path (#274)."""

    def record(self, call: GenerationCall) -> str | None:
        return None

    def flush(self) -> None:
        return None

    def delete_user_traces(self, clerk_user_id: str) -> None:
        # Nothing was captured on the unconfigured path, so there is nothing to
        # erase; a no-op that never raises upholds the port's erasure contract.
        return None


__all__ = ["GenerationCallRecorder", "NoOpGenerationCallRecorder"]
