"""The ``RecordingStructuredLLM`` decorator (#270/#271).

The decorator is where AI-usage capture lives — in exactly one place, wrapping the
provider. These tests exercise it through its public ``complete(...)`` with a fake inner
provider and a fake recorder (never by reaching into its private timing state), pinning
the four load-bearing behaviors: it returns the inner text unchanged; it records one
``Generation Call`` carrying the tokens/model/provider/kind/user; it records on
``GenerationError`` too (failure outcome) and re-raises the original error; and it is
**best-effort** — a recorder that raises is swallowed and never changes what ``complete``
returns."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.generation.llm.port import GenerationError
from app.generation.llm.usage import CompletionResult, TokenUsage
from app.generation.monitoring.call import (
    GenerationCallContext,
    GenerationOutcome,
    GeneratorKind,
    TraceCapture,
)
from app.generation.monitoring.recording_llm import RecordingStructuredLLM


class _Schema(BaseModel):
    value: str


class _FakeProvider:
    """A ``CompletionProvider`` that returns a canned result or raises."""

    def __init__(
        self, *, result: CompletionResult | None = None, error: Exception | None = None
    ) -> None:
        self._result = result
        self._error = error
        self.calls: list[dict] = []

    def complete(self, **kwargs) -> CompletionResult:
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        assert self._result is not None, "_FakeProvider needs result or error"
        return self._result


class _FakeRecorder:
    """Captures recorded calls, or raises to prove best-effort recording.

    ``trace_id`` is the handle ``record`` hands back — the lineage the decorator writes
    into the context's capture (#274); ``None`` models a backend (the no-op) with none."""

    def __init__(
        self,
        *,
        trace_id: str | None = None,
        error: Exception | None = None,
        flush_error: Exception | None = None,
    ) -> None:
        self._trace_id = trace_id
        self._error = error
        self._flush_error = flush_error
        self.recorded: list = []
        self.flushes = 0

    def record(self, call) -> str | None:
        self.recorded.append(call)
        if self._error is not None:
            raise self._error
        return self._trace_id

    def flush(self) -> None:
        self.flushes += 1
        if self._flush_error is not None:
            raise self._flush_error


_CONTEXT = GenerationCallContext(
    generator_kind=GeneratorKind.PROTOCOL, clerk_user_id="user_123"
)


def _decorator(provider, recorder, *, provider_name="anthropic", model="claude-x"):
    return RecordingStructuredLLM(
        provider, recorder=recorder, provider_name=provider_name, model=model
    )


def _complete(llm) -> str:
    return llm.complete(
        system="sys", user="usr", schema=_Schema, max_tokens=100, context=_CONTEXT
    )


def test_returns_inner_provider_text_unchanged():
    # Arrange
    provider = _FakeProvider(
        result=CompletionResult(
            text='{"value": "ok"}',
            usage=TokenUsage(input_tokens=11, output_tokens=22),
            model="claude-served",
        )
    )
    llm = _decorator(provider, _FakeRecorder())

    # Act
    text = _complete(llm)

    # Assert — the port contract is unchanged: just the provider's text
    assert text == '{"value": "ok"}'


def test_does_not_pass_context_down_to_the_provider():
    # Arrange — the provider is pure transport and carries no monitoring concern
    provider = _FakeProvider(
        result=CompletionResult(text="{}", usage=TokenUsage.empty(), model="m")
    )
    llm = _decorator(provider, _FakeRecorder())

    # Act
    _complete(llm)

    # Assert — the additive context stays in the decorator, off the provider call
    assert "context" not in provider.calls[0]


def test_records_one_success_call_with_the_metered_envelope():
    # Arrange
    provider = _FakeProvider(
        result=CompletionResult(
            text="{}",
            usage=TokenUsage(input_tokens=100, output_tokens=250),
            model="claude-served",
        )
    )
    recorder = _FakeRecorder()
    llm = _decorator(provider, recorder, provider_name="anthropic")

    # Act
    _complete(llm)

    # Assert — exactly one call carrying kind/user/tokens/model/provider/outcome
    assert len(recorder.recorded) == 1
    call = recorder.recorded[0]
    assert call.generator_kind == GeneratorKind.PROTOCOL
    assert call.clerk_user_id == "user_123"
    assert call.input_tokens == 100
    assert call.output_tokens == 250
    assert call.model == "claude-served"
    assert call.provider == "anthropic"
    assert call.outcome == GenerationOutcome.SUCCESS
    assert call.latency_ms >= 0.0


def test_records_prompt_and_output_text_on_success():
    # Arrange — the recorder must be able to replay exactly what the model saw
    provider = _FakeProvider(
        result=CompletionResult(
            text='{"value": "generated"}',
            usage=TokenUsage(input_tokens=1, output_tokens=2),
            model="m",
        )
    )
    recorder = _FakeRecorder()
    llm = _decorator(provider, recorder)

    # Act
    llm.complete(
        system="you are a coach",
        user="build me a push protocol",
        schema=_Schema,
        max_tokens=100,
        context=_CONTEXT,
    )

    # Assert — the full prompt (system + user) and the output text are captured
    call = recorder.recorded[0]
    assert call.system_prompt == "you are a coach"
    assert call.user_prompt == "build me a push protocol"
    assert call.output_text == '{"value": "generated"}'


def test_records_unattributed_call_when_no_user_on_context():
    # Arrange — an enrichment call invents no user
    provider = _FakeProvider(
        result=CompletionResult(text="{}", usage=TokenUsage.empty(), model="m")
    )
    recorder = _FakeRecorder()
    llm = _decorator(provider, recorder)

    # Act
    llm.complete(
        system="s",
        user="u",
        schema=_Schema,
        max_tokens=10,
        context=GenerationCallContext(generator_kind=GeneratorKind.EXERCISE_ENRICHMENT),
    )

    # Assert — recorded, left unattributed rather than given an invented user
    assert recorder.recorded[0].clerk_user_id is None
    assert recorder.recorded[0].generator_kind == GeneratorKind.EXERCISE_ENRICHMENT


def test_records_failure_and_reraises_the_original_error():
    # Arrange — the provider raises the transport error
    original = GenerationError("connection reset")
    provider = _FakeProvider(error=original)
    recorder = _FakeRecorder()
    llm = _decorator(provider, recorder, model="claude-x")

    # Act / Assert — the original error propagates unchanged
    with pytest.raises(GenerationError) as exc_info:
        _complete(llm)
    assert exc_info.value is original

    # Assert — the failure was still recorded (with the failure outcome)
    assert len(recorder.recorded) == 1
    call = recorder.recorded[0]
    assert call.outcome == GenerationOutcome.ERROR
    assert call.generator_kind == GeneratorKind.PROTOCOL
    assert call.model == "claude-x"
    assert call.input_tokens is None
    assert call.output_tokens is None
    # The prompt is still captured on failure; there is no output text
    assert call.system_prompt == "sys"
    assert call.user_prompt == "usr"
    assert call.output_text is None


def test_recorder_failure_is_swallowed_and_result_unaffected():
    # Arrange — the recorder itself raises; the generation must still succeed
    provider = _FakeProvider(
        result=CompletionResult(text="value", usage=TokenUsage.empty(), model="m")
    )
    recorder = _FakeRecorder(error=RuntimeError("langfuse is down"))
    llm = _decorator(provider, recorder)

    # Act — best-effort: no exception escapes, the text is returned intact
    text = _complete(llm)

    # Assert
    assert text == "value"


def test_writes_returned_trace_id_into_the_context_capture():
    # Arrange — the caller passes a capture to receive the call's lineage handle
    provider = _FakeProvider(
        result=CompletionResult(text="{}", usage=TokenUsage.empty(), model="m")
    )
    recorder = _FakeRecorder(trace_id="trace-xyz")
    llm = _decorator(provider, recorder)
    capture = TraceCapture()

    # Act
    llm.complete(
        system="s",
        user="u",
        schema=_Schema,
        max_tokens=10,
        context=GenerationCallContext(
            generator_kind=GeneratorKind.PROTOCOL, capture=capture
        ),
    )

    # Assert — the handle rides back out through the capture (complete still returns str)
    assert capture.trace_id == "trace-xyz"


def test_capture_stays_none_when_recorder_reports_no_trace_id():
    # Arrange — a no-op-style recorder returns no handle
    provider = _FakeProvider(
        result=CompletionResult(text="{}", usage=TokenUsage.empty(), model="m")
    )
    llm = _decorator(provider, _FakeRecorder(trace_id=None))
    capture = TraceCapture()

    # Act
    llm.complete(
        system="s",
        user="u",
        schema=_Schema,
        max_tokens=10,
        context=GenerationCallContext(
            generator_kind=GeneratorKind.PROTOCOL, capture=capture
        ),
    )

    # Assert — lineage is simply absent, no error
    assert capture.trace_id is None


def test_capture_stays_none_when_recorder_raises():
    # Arrange — best-effort: a recorder that raises must not populate the capture
    provider = _FakeProvider(
        result=CompletionResult(text="ok", usage=TokenUsage.empty(), model="m")
    )
    recorder = _FakeRecorder(trace_id="never", error=RuntimeError("langfuse is down"))
    llm = _decorator(provider, recorder)
    capture = TraceCapture()

    # Act — the generation still succeeds and returns its text
    text = llm.complete(
        system="s",
        user="u",
        schema=_Schema,
        max_tokens=10,
        context=GenerationCallContext(
            generator_kind=GeneratorKind.PROTOCOL, capture=capture
        ),
    )

    # Assert — text intact, capture left empty
    assert text == "ok"
    assert capture.trace_id is None


def test_completes_without_a_capture_on_the_context():
    # Arrange — most call sites pass no capture; the decorator must not require one
    provider = _FakeProvider(
        result=CompletionResult(text="ok", usage=TokenUsage.empty(), model="m")
    )
    llm = _decorator(provider, _FakeRecorder(trace_id="trace-1"))

    # Act / Assert — no capture, no crash, text returned
    assert _complete(llm) == "ok"


def test_flush_delegates_to_the_recorder():
    # Arrange — the worker asks the decorator to flush at the end of a job
    provider = _FakeProvider(
        result=CompletionResult(text="{}", usage=TokenUsage.empty(), model="m")
    )
    recorder = _FakeRecorder()
    llm = _decorator(provider, recorder)

    # Act
    llm.flush()

    # Assert — the flush reached the injected recorder
    assert recorder.flushes == 1


def test_flush_failure_is_swallowed():
    # Arrange — a flush that raises must never fail the job (best-effort)
    provider = _FakeProvider(
        result=CompletionResult(text="{}", usage=TokenUsage.empty(), model="m")
    )
    recorder = _FakeRecorder(flush_error=RuntimeError("langfuse is down"))
    llm = _decorator(provider, recorder)

    # Act / Assert — no exception escapes
    llm.flush()
    assert recorder.flushes == 1


def test_recorder_failure_on_error_path_still_reraises_generation_error():
    # Arrange — provider fails AND the recorder fails; the caller must see the
    # original GenerationError, not the recorder's error
    original = GenerationError("boom")
    provider = _FakeProvider(error=original)
    recorder = _FakeRecorder(error=RuntimeError("langfuse is down"))
    llm = _decorator(provider, recorder)

    # Act / Assert
    with pytest.raises(GenerationError) as exc_info:
        _complete(llm)
    assert exc_info.value is original
