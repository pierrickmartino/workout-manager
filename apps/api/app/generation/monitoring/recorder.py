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
    """Durably records a metered ``Generation Call`` (the operator's usage log)."""

    def record(self, call: GenerationCall) -> None: ...


class NoOpGenerationCallRecorder:
    """Records nothing — the default when no monitoring backend is configured.

    Selected by the factory for any deployment without Langfuse and used by the whole
    offline suite, so generation runs exactly as it did before monitoring. It never
    raises, upholding the best-effort guarantee even on the default path."""

    def record(self, call: GenerationCall) -> None:
        return None


__all__ = ["GenerationCallRecorder", "NoOpGenerationCallRecorder"]
