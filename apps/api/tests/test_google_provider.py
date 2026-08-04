"""The Google (Gemini) ``StructuredLLM`` provider (ADR-0006).

Like the Anthropic and OpenAI providers, the Google provider is a deep transport
module: it hides the ``google-genai`` SDK's quirks — client streaming,
``response_schema`` + JSON response mime type, ``.text`` extraction, error
wrapping — behind the one-method ``complete()`` port. These tests fake the SDK
client (mirroring the other providers' ``_FakeClient`` pattern) so the
externally observable behavior is pinned without a network call: given faked
stream chunks, ``complete()`` assembles their ``.text``; given an SDK error, it
raises ``GenerationError``."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.generation.generator import GenerationError
from app.generation.llm.providers.google_provider import GoogleStructuredLLM


class _Schema(BaseModel):
    value: str


class _UsageMetadata:
    def __init__(self, *, prompt_token_count: int, candidates_token_count: int) -> None:
        self.prompt_token_count = prompt_token_count
        self.candidates_token_count = candidates_token_count


class _Chunk:
    def __init__(self, text: str | None, usage_metadata: object | None = None) -> None:
        self.text = text
        self.usage_metadata = usage_metadata


class _Models:
    def __init__(self, *, chunks=None, error: Exception | None = None):
        self._chunks = chunks or []
        self._error = error
        self.calls: list[dict] = []

    def generate_content_stream(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return iter(self._chunks)


class _FakeClient:
    def __init__(self, *, chunks=None, error: Exception | None = None):
        self.models = _Models(chunks=chunks, error=error)


def test_complete_assembles_streamed_chunk_text():
    # Arrange — the JSON text arrives split across streamed chunks
    client = _FakeClient(chunks=[_Chunk('{"value":'), _Chunk(' "ok"}')])
    llm = GoogleStructuredLLM(client, model="gemini-3.1-pro")

    # Act
    result = llm.complete(system="sys", user="usr", schema=_Schema, max_tokens=4000)

    # Assert — the final assembled text (not chunks), model carried
    assert result.text == '{"value": "ok"}'
    assert result.model == "gemini-3.1-pro"


def test_complete_extracts_real_token_usage_from_stream_metadata():
    # Arrange — Gemini reports usage on the stream's final chunk (cumulative
    # usage_metadata); the provider must capture and normalize it
    client = _FakeClient(
        chunks=[
            _Chunk('{"value":'),
            _Chunk(
                ' "ok"}',
                usage_metadata=_UsageMetadata(
                    prompt_token_count=150, candidates_token_count=42
                ),
            ),
        ]
    )
    llm = GoogleStructuredLLM(client, model="gemini-3.1-pro")

    # Act
    result = llm.complete(system="sys", user="usr", schema=_Schema, max_tokens=4000)

    # Assert — prompt_token_count -> input, candidates_token_count -> output,
    # text unchanged
    assert result.usage.input_tokens == 150
    assert result.usage.output_tokens == 42
    assert result.text == '{"value": "ok"}'


def test_complete_reports_empty_usage_when_stream_omits_metadata():
    # Arrange — no chunk carries usage_metadata; the extractor is defensive
    # (missing metadata -> empty) so a usage-shape change never breaks generation
    client = _FakeClient(chunks=[_Chunk('{"value": "ok"}')])
    llm = GoogleStructuredLLM(client, model="gemini-3.1-pro")

    # Act
    result = llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)

    # Assert
    assert result.usage.input_tokens is None
    assert result.usage.output_tokens is None


def test_complete_constrains_output_with_schema_and_json_mime():
    # Arrange
    client = _FakeClient(chunks=[_Chunk("{}")])
    llm = GoogleStructuredLLM(client, model="gemini-test-model")

    # Act
    llm.complete(system="the-system", user="the-user", schema=_Schema, max_tokens=1234)

    # Assert — model + user prompt, and the config carries native schema
    # enforcement (response_schema) plus the JSON mime type, the system
    # instruction, and the per-call budget
    call = client.models.calls[0]
    assert call["model"] == "gemini-test-model"
    assert call["contents"] == "the-user"
    assert call["config"]["system_instruction"] == "the-system"
    assert call["config"]["max_output_tokens"] == 1234
    assert call["config"]["response_mime_type"] == "application/json"
    assert call["config"]["response_schema"] is _Schema


def test_complete_wraps_sdk_errors_as_generation_error():
    # Arrange — the SDK call itself blows up (network / API failure)
    llm = GoogleStructuredLLM(
        _FakeClient(error=RuntimeError("connection reset")), model="gemini-3.1-pro"
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)


def test_complete_wraps_mid_stream_errors_as_generation_error():
    # Arrange — the stream is lazy; a failure can surface while iterating chunks
    def _failing_stream():
        yield _Chunk('{"value":')
        raise RuntimeError("stream interrupted")

    client = _FakeClient()
    client.models.generate_content_stream = lambda **kwargs: _failing_stream()
    llm = GoogleStructuredLLM(client, model="gemini-3.1-pro")

    # Act / Assert
    with pytest.raises(GenerationError):
        llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)


def test_complete_skips_chunks_without_text():
    # Arrange — Gemini may emit chunks whose ``.text`` is None (e.g. a
    # non-text part); the boundary parse_* net should see a string, not None
    client = _FakeClient(chunks=[_Chunk('{"value":'), _Chunk(None), _Chunk(' "ok"}')])
    llm = GoogleStructuredLLM(client, model="gemini-3.1-pro")

    # Act
    result = llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)

    # Assert
    assert result.text == '{"value": "ok"}'
