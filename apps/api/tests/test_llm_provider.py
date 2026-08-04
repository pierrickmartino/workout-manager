"""The Anthropic transport provider (ADR-0006, #270/#271).

The provider is the deep transport module: it hides the Anthropic SDK's
quirks — client streaming, native ``output_format`` schema enforcement,
adaptive thinking, content-block text assembly, error wrapping — behind the
one-method ``complete()``. These tests fake the SDK client (mirroring the
existing ``_FakeClient`` pattern) so the externally observable behavior is
pinned without a network call: given a faked response, ``complete()`` returns a
``CompletionResult`` carrying the assembled text, the *real* extracted token
usage (Anthropic is the default provider), and the model; given an SDK error, it
raises ``GenerationError``."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.generation.generator import GenerationError
from app.generation.llm.providers.anthropic_provider import AnthropicStructuredLLM


class _Schema(BaseModel):
    value: str


class _TextBlock:
    type = "text"

    def __init__(self, text: str) -> None:
        self.text = text


class _ThinkingBlock:
    type = "thinking"

    def __init__(self, text: str) -> None:
        self.thinking = text


class _Usage:
    def __init__(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FinalMessage:
    def __init__(self, content: list, usage=None) -> None:
        self.content = content
        if usage is not None:
            self.usage = usage


class _StreamCtx:
    def __init__(self, message: _FinalMessage) -> None:
        self._message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self) -> _FinalMessage:
        return self._message


class _Messages:
    def __init__(self, *, message=None, error: Exception | None = None):
        self._message = message
        self._error = error
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return _StreamCtx(self._message)


class _FakeClient:
    def __init__(self, *, message=None, error: Exception | None = None):
        self.messages = _Messages(message=message, error=error)


def test_complete_assembles_text_from_content_blocks():
    # Arrange — a final message with a thinking block then two text blocks
    message = _FinalMessage(
        [_ThinkingBlock("reasoning"), _TextBlock('{"value":'), _TextBlock(' "ok"}')],
        usage=_Usage(input_tokens=12, output_tokens=34),
    )
    llm = AnthropicStructuredLLM(_FakeClient(message=message), model="claude-opus-4-8")

    # Act
    result = llm.complete(system="sys", user="usr", schema=_Schema, max_tokens=4000)

    # Assert — only text blocks are assembled (thinking dropped); model carried through
    assert result.text == '{"value": "ok"}'
    assert result.model == "claude-opus-4-8"


def test_complete_extracts_real_token_usage():
    # Arrange — Anthropic is the default provider and reports real usage
    message = _FinalMessage(
        [_TextBlock("{}")], usage=_Usage(input_tokens=100, output_tokens=250)
    )
    llm = AnthropicStructuredLLM(_FakeClient(message=message), model="claude-opus-4-8")

    # Act
    result = llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)

    # Assert — the SDK's usage is normalized onto the result, not discarded
    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 250


def test_complete_reports_empty_usage_when_message_has_no_usage():
    # Arrange — a message without a usage attribute must not break generation
    message = _FinalMessage([_TextBlock("{}")])  # no usage
    llm = AnthropicStructuredLLM(_FakeClient(message=message), model="claude-opus-4-8")

    # Act
    result = llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)

    # Assert — empty usage (unknown), text still assembled
    assert result.usage.input_tokens is None
    assert result.usage.output_tokens is None
    assert result.text == "{}"


def test_complete_passes_model_schema_thinking_and_max_tokens():
    # Arrange
    message = _FinalMessage([_TextBlock("{}")])
    client = _FakeClient(message=message)
    llm = AnthropicStructuredLLM(client, model="claude-test-model")

    # Act
    llm.complete(system="the-system", user="the-user", schema=_Schema, max_tokens=1234)

    # Assert — native schema enforcement, adaptive thinking, and the request config
    call = client.messages.calls[0]
    assert call["model"] == "claude-test-model"
    assert call["max_tokens"] == 1234
    assert call["thinking"] == {"type": "adaptive"}
    assert call["system"] == "the-system"
    assert call["messages"] == [{"role": "user", "content": "the-user"}]
    assert call["output_format"] is _Schema


def test_complete_wraps_sdk_errors_as_generation_error():
    # Arrange — the SDK call itself blows up (network / API failure)
    llm = AnthropicStructuredLLM(
        _FakeClient(error=RuntimeError("connection reset")), model="claude-opus-4-8"
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)
