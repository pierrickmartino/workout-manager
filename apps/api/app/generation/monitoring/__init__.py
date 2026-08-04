"""Operational AI-usage monitoring (ADR-0039, PRD #270).

Monitoring is *operational*, explicitly outside the product domain — it serves the
operator, never the end user, and earns no term in ``CONTEXT.md``. A ``Generation Call``
is one metered round-trip to a model provider through the ``StructuredLLM`` seam,
captured by the ``RecordingStructuredLLM`` decorator and handed to a ``GenerationCallRecorder``
port (a no-op by default, so the app stays fully offline-testable)."""

from __future__ import annotations

from app.generation.monitoring.call import (
    GenerationCall,
    GenerationCallContext,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.recorder import (
    GenerationCallRecorder,
    NoOpGenerationCallRecorder,
)
from app.generation.monitoring.recording_llm import RecordingStructuredLLM

__all__ = [
    "GeneratorKind",
    "GenerationOutcome",
    "GenerationCallContext",
    "GenerationCall",
    "GenerationCallRecorder",
    "NoOpGenerationCallRecorder",
    "RecordingStructuredLLM",
]
