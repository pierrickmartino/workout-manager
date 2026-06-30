"""The OpenAI ``StructuredLLM`` provider (ADR-0006).

Like the Anthropic provider, the OpenAI provider is a deep transport module: it
hides the OpenAI SDK's quirks — client streaming, strict ``json_schema``
structured output, ``choices[].message.content`` extraction, error wrapping —
behind the one-method ``complete()`` port. These tests fake the SDK client
(mirroring the Anthropic provider's ``_FakeClient`` pattern) so the externally
observable behavior is pinned without a network call: given a faked completion,
``complete()`` returns the message content; given an SDK error, it raises
``GenerationError``."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.generation.generator import GenerationError
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM


class _Schema(BaseModel):
    value: str


class _Message:
    def __init__(self, content: str | None) -> None:
        self.content = content


class _Choice:
    def __init__(self, content: str | None) -> None:
        self.message = _Message(content)


class _Completion:
    def __init__(self, choices: list) -> None:
        self.choices = choices


class _StreamCtx:
    def __init__(self, completion: _Completion) -> None:
        self._completion = completion

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_completion(self) -> _Completion:
        return self._completion


class _Completions:
    def __init__(self, *, completion=None, error: Exception | None = None):
        self._completion = completion
        self._error = error
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return _StreamCtx(self._completion)


class _Chat:
    def __init__(self, *, completion=None, error: Exception | None = None):
        self.completions = _Completions(completion=completion, error=error)


class _FakeClient:
    def __init__(self, *, completion=None, error: Exception | None = None):
        self.chat = _Chat(completion=completion, error=error)


def test_complete_returns_message_content():
    # Arrange — a completion whose first choice carries the JSON text
    completion = _Completion([_Choice('{"value": "ok"}')])
    llm = OpenAIStructuredLLM(_FakeClient(completion=completion), model="gpt-5.5")

    # Act
    text = llm.complete(system="sys", user="usr", schema=_Schema, max_tokens=4000)

    # Assert
    assert text == '{"value": "ok"}'


def test_complete_passes_model_schema_and_max_tokens():
    # Arrange
    completion = _Completion([_Choice("{}")])
    client = _FakeClient(completion=completion)
    llm = OpenAIStructuredLLM(client, model="gpt-test-model")

    # Act
    llm.complete(system="the-system", user="the-user", schema=_Schema, max_tokens=1234)

    # Assert — strict json_schema via response_format, model, budget, and the
    # system/user message split
    call = client.chat.completions.calls[0]
    assert call["model"] == "gpt-test-model"
    assert call["max_completion_tokens"] == 1234
    assert call["response_format"] is _Schema
    assert call["messages"] == [
        {"role": "system", "content": "the-system"},
        {"role": "user", "content": "the-user"},
    ]


def test_complete_wraps_sdk_errors_as_generation_error():
    # Arrange — the SDK call itself blows up (network / API failure)
    llm = OpenAIStructuredLLM(
        _FakeClient(error=RuntimeError("connection reset")), model="gpt-5.5"
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)


def test_complete_returns_empty_string_when_content_is_none():
    # Arrange — OpenAI may return null content (e.g. a refusal); the boundary
    # parse_* net should see a string, not None
    completion = _Completion([_Choice(None)])
    llm = OpenAIStructuredLLM(_FakeClient(completion=completion), model="gpt-5.5")

    # Act
    text = llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)

    # Assert
    assert text == ""
