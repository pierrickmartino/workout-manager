"""The Anthropic ``StructuredLLM`` provider (ADR-0006).

The provider is the deep transport module: it hides the Anthropic SDK's
quirks — client streaming, native ``output_format`` schema enforcement,
adaptive thinking, content-block text assembly, error wrapping — behind the
one-method ``complete()`` port. These tests fake the SDK client (mirroring the
existing ``_FakeClient`` pattern) so the externally observable behavior is
pinned without a network call: given a faked response, ``complete()`` returns
the assembled text; given an SDK error, it raises ``GenerationError``."""

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


class _FinalMessage:
    def __init__(self, content: list) -> None:
        self.content = content


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
        [_ThinkingBlock("reasoning"), _TextBlock('{"value":'), _TextBlock(' "ok"}')]
    )
    llm = AnthropicStructuredLLM(_FakeClient(message=message), model="claude-opus-4-8")

    # Act
    text = llm.complete(
        system="sys", user="usr", schema=_Schema, max_tokens=4000
    )

    # Assert — only text blocks are assembled; thinking is dropped
    assert text == '{"value": "ok"}'


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
