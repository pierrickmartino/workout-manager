"""Value types for a recorded ``Generation Call`` (operational monitoring, #270/#271).

A ``Generation Call`` is one metered round-trip to a model provider through the
``StructuredLLM`` seam — it exists only on a cache miss (a cache *hit* is adopt-by-copy,
no provider call). The ``GenerationCallContext`` is the one additive, provider-agnostic
parameter the caller passes into ``complete`` (only the caller knows a generation is a
"protocol" vs a "substitute"); the ``GenerationCall`` is the immutable record the
recording decorator assembles and hands to the recorder port.

These are plain value types with no I/O — the monitoring concern is quarantined from the
generators and the observability vendor alike."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class GeneratorKind(str, Enum):
    """Which generator produced a call — the operator's primary spend breakdown.

    ``MUSCLE_EMPHASIS`` is the live catalog split during generation; ``EXERCISE_ENRICHMENT``
    is the human-triggered re-enrichment batch (same generator, different caller), so the
    kind is supplied by the caller rather than fixed by the generator class."""

    SESSION = "session"
    PROTOCOL = "protocol"
    REGENERATION = "regeneration"
    SUBSTITUTE = "substitute"
    MUSCLE_EMPHASIS = "muscle-emphasis"
    EXERCISE_ENRICHMENT = "exercise-enrichment"


class GenerationOutcome(str, Enum):
    """Whether the metered call succeeded or raised ``GenerationError``.

    Failures are recorded too (not only successes), so the operator sees the failure
    rate rather than a log of silent absences."""

    SUCCESS = "success"
    ERROR = "error"


@dataclass(frozen=True)
class GenerationCallContext:
    """The additive, provider-agnostic parameter carried into ``complete``.

    ``generator_kind`` tags which generator made the call; ``clerk_user_id`` attributes it
    to the originating user when there is one and is ``None`` for unattributed calls (e.g.
    catalog enrichment, which invents no user). Passed explicitly per call rather than via
    hidden global state, so the seam stays testable and predictable."""

    generator_kind: GeneratorKind
    clerk_user_id: str | None = None


@dataclass(frozen=True)
class GenerationCall:
    """One recorded metered provider call — the durable unit of AI-usage monitoring.

    Carries the generator kind and originating user from the context, the normalized token
    counts, the model and provider that served it, the wall-clock latency, and the outcome.
    Prompt/output text and the Langfuse trace id are captured by a later slice; this spine
    records the metered envelope every later slice builds on."""

    generator_kind: GeneratorKind
    clerk_user_id: str | None
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: float
    outcome: GenerationOutcome


__all__ = [
    "GeneratorKind",
    "GenerationOutcome",
    "GenerationCallContext",
    "GenerationCall",
]
