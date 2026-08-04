"""The ``GenerationCallRecorder`` port's no-op default (#270/#271).

The no-op recorder is the default for any deployment without a monitoring backend, and
for the whole offline suite. Its contract is simply: do nothing, and never raise — so
generation on the default path behaves exactly as it did before monitoring, and the
best-effort guarantee holds even when nothing is configured. The Langfuse-backed recorder
is a later slice."""

from __future__ import annotations

from app.generation.monitoring.call import (
    GenerationCall,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.recorder import NoOpGenerationCallRecorder


def _call() -> GenerationCall:
    return GenerationCall(
        generator_kind=GeneratorKind.SESSION,
        clerk_user_id="user_1",
        provider="anthropic",
        model="claude-x",
        input_tokens=10,
        output_tokens=20,
        latency_ms=1.5,
        outcome=GenerationOutcome.SUCCESS,
        system_prompt="sys",
        user_prompt="usr",
        output_text='{"ok": true}',
    )


def test_record_does_nothing_and_returns_none():
    # Arrange
    recorder = NoOpGenerationCallRecorder()

    # Act / Assert — recording is a no-op that never raises
    assert recorder.record(_call()) is None


def test_flush_does_nothing_and_returns_none():
    # Arrange
    recorder = NoOpGenerationCallRecorder()

    # Act / Assert — flushing is a no-op that never raises
    assert recorder.flush() is None


def test_delete_user_traces_does_nothing_and_returns_none():
    # Arrange
    recorder = NoOpGenerationCallRecorder()

    # Act / Assert — per-user erasure is a no-op that never raises on the
    # unconfigured path (there is nothing captured to erase)
    assert recorder.delete_user_traces("user_1") is None
