"""The ``LangfuseGenerationCallRecorder`` — the production recorder (#270/#273).

The recorder maps one ``Generation Call`` to a **flat** self-hosted Langfuse trace (one
trace per call), stamping the trace's first-class ``user_id = clerk_user_id`` so a user's
traces are addressable, capturing the full prompt (system + user) and the model output, and
emitting **tokens + model only** — never cost, which Langfuse owns.

These tests drive it through a **faked** low-level Langfuse client, so the suite stays fully
offline (no live Langfuse, mirroring the injected fake LLM / JWKS elsewhere). They assert the
external payload the recorder hands the client, never its internals."""

from __future__ import annotations

from app.generation.monitoring.call import (
    GenerationCall,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.langfuse_recorder import LangfuseGenerationCallRecorder


class _FakeGeneration:
    """Captures the kwargs a generation was created with."""

    def __init__(self, kwargs: dict) -> None:
        self.kwargs = kwargs


class _FakeTrace:
    """Captures its own kwargs and the single generation nested under it.

    Carries an ``id`` like the real low-level trace handle, so the recorder can
    return it as the call's trace-id handle (the lineage the adopt/regeneration
    chain carries, #274)."""

    def __init__(self, kwargs: dict, trace_id: str) -> None:
        self.kwargs = kwargs
        self.id = trace_id
        self.generations: list[_FakeGeneration] = []

    def generation(self, **kwargs) -> _FakeGeneration:
        gen = _FakeGeneration(kwargs)
        self.generations.append(gen)
        return gen


class _FakeLangfuseClient:
    """A stand-in for the low-level Langfuse SDK client — records, never networks."""

    def __init__(self) -> None:
        self.traces: list[_FakeTrace] = []
        self.flushes = 0

    def trace(self, **kwargs) -> _FakeTrace:
        trace = _FakeTrace(kwargs, trace_id=f"trace-{len(self.traces)}")
        self.traces.append(trace)
        return trace

    def flush(self) -> None:
        self.flushes += 1


def _call(**overrides) -> GenerationCall:
    base = dict(
        generator_kind=GeneratorKind.PROTOCOL,
        clerk_user_id="user_abc",
        provider="anthropic",
        model="claude-served",
        input_tokens=120,
        output_tokens=340,
        latency_ms=1234.5,
        outcome=GenerationOutcome.SUCCESS,
        system_prompt="you are a coach",
        user_prompt="build me a push protocol",
        output_text='{"weeks": 4}',
    )
    base.update(overrides)
    return GenerationCall(**base)


def test_record_creates_one_flat_trace_with_one_generation():
    # Arrange
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.record(_call())

    # Assert — flat: exactly one trace, carrying exactly one generation
    assert len(client.traces) == 1
    assert len(client.traces[0].generations) == 1


def test_record_returns_the_trace_id_handle():
    # Arrange
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act — record hands back the created trace's id, the lineage the Generated
    # artifact and the adopt/regeneration chain carry (#274).
    handle = recorder.record(_call())

    # Assert
    assert handle == client.traces[0].id


def test_record_stamps_user_id_on_the_trace():
    # Arrange
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.record(_call(clerk_user_id="user_abc"))

    # Assert — the trace carries the first-class user_id for erasure addressability
    assert client.traces[0].kwargs["user_id"] == "user_abc"


def test_record_captures_prompt_output_tokens_and_model_on_the_generation():
    # Arrange
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.record(_call())

    # Assert — the generation replays exactly what the model saw
    gen = client.traces[0].generations[0].kwargs
    assert gen["model"] == "claude-served"
    assert gen["input"] == {
        "system": "you are a coach",
        "user": "build me a push protocol",
    }
    assert gen["output"] == '{"weeks": 4}'
    assert gen["usage"]["input"] == 120
    assert gen["usage"]["output"] == 340


# Cost/price keys the app must never send — Langfuse owns pricing (ADR-0039).
_FORBIDDEN_COST_KEYS = frozenset(
    {"cost", "input_cost", "output_cost", "total_cost", "price", "unit_price"}
)


def test_record_never_sends_cost_only_tokens_and_model():
    # Arrange
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.record(_call())

    # Assert — no cost/price anywhere in the usage payload; only token counts + unit
    gen = client.traces[0].generations[0].kwargs
    assert set(gen["usage"]).isdisjoint(_FORBIDDEN_COST_KEYS)
    assert gen["usage"]["unit"] == "TOKENS"


def test_record_leaves_trace_unattributed_when_there_is_no_user():
    # Arrange — an enrichment call invents no user
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.record(
        _call(generator_kind=GeneratorKind.EXERCISE_ENRICHMENT, clerk_user_id=None)
    )

    # Assert — the trace is left unattributed rather than given an invented user
    assert client.traces[0].kwargs["user_id"] is None


def test_record_marks_a_failed_call_as_an_error_observation():
    # Arrange — a failed metered call has no output text
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.record(_call(outcome=GenerationOutcome.ERROR, output_text=None))

    # Assert — surfaced as an error observation so failure-rate is honest; output absent
    gen = client.traces[0].generations[0].kwargs
    assert gen["level"] == "ERROR"
    assert gen["output"] is None


def test_flush_delegates_to_the_client():
    # Arrange
    client = _FakeLangfuseClient()
    recorder = LangfuseGenerationCallRecorder(client)

    # Act
    recorder.flush()

    # Assert — the worker's end-of-job flush reaches the SDK client
    assert client.flushes == 1
