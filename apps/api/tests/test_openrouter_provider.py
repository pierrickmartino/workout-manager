"""The OpenRouter ``StructuredLLM`` provider (ADR-0006).

OpenRouter speaks the OpenAI wire protocol, so the provider *is* the OpenAI SDK
client pointed at OpenRouter's base URL: ``OpenRouterStructuredLLM`` reuses the
OpenAI provider's streaming, ``response_format`` structured output, and
``choices[].message.content`` extraction unchanged (no ``openai``
re-implementation). These tests pin the externally observable behavior without a
network call — base-URL configuration of the client, content extraction, and
error wrapping — by faking the OpenAI SDK client (the same ``_FakeClient``
shape the OpenAI provider tests use)."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.generation.generator import GenerationError
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM
from app.generation.llm.providers.openrouter_provider import (
    OPENROUTER_BASE_URL,
    OpenRouterStructuredLLM,
    build_openrouter_client,
)


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


def test_build_openrouter_client_points_at_openrouter_base_url():
    # Arrange / Act — the OpenAI SDK client configured for OpenRouter
    client = build_openrouter_client("key-openrouter")

    # Assert — same SDK, OpenRouter base URL (the SDK appends a trailing slash)
    assert str(client.base_url).rstrip("/") == OPENROUTER_BASE_URL
    assert OPENROUTER_BASE_URL == "https://openrouter.ai/api/v1"


def test_reuses_the_openai_wire_path():
    # The provider must not re-implement the OpenAI wire path; it inherits it.
    assert issubclass(OpenRouterStructuredLLM, OpenAIStructuredLLM)


def test_complete_returns_message_content():
    # Arrange — a completion whose first choice carries the JSON text
    completion = _Completion([_Choice('{"value": "ok"}')])
    llm = OpenRouterStructuredLLM(
        _FakeClient(completion=completion), model="openai/gpt-oss-120b:free"
    )

    # Act
    text = llm.complete(system="sys", user="usr", schema=_Schema, max_tokens=4000)

    # Assert
    assert text == '{"value": "ok"}'


def test_complete_passes_model_schema_and_max_tokens():
    # Arrange
    completion = _Completion([_Choice("{}")])
    client = _FakeClient(completion=completion)
    llm = OpenRouterStructuredLLM(client, model="some/routed-model")

    # Act
    llm.complete(system="the-system", user="the-user", schema=_Schema, max_tokens=1234)

    # Assert — best-effort response_format schema, routed model, budget, messages
    call = client.chat.completions.calls[0]
    assert call["model"] == "some/routed-model"
    assert call["max_completion_tokens"] == 1234
    assert call["response_format"] is _Schema
    assert call["messages"] == [
        {"role": "system", "content": "the-system"},
        {"role": "user", "content": "the-user"},
    ]


def test_complete_wraps_sdk_errors_as_generation_error():
    # Arrange — the SDK call itself blows up (network / API failure)
    llm = OpenRouterStructuredLLM(
        _FakeClient(error=RuntimeError("connection reset")),
        model="openai/gpt-oss-120b:free",
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)


def test_complete_returns_empty_string_when_content_is_none():
    # Arrange — a null content (e.g. a refusal); the boundary parse_* net should
    # see a string, not None
    completion = _Completion([_Choice(None)])
    llm = OpenRouterStructuredLLM(
        _FakeClient(completion=completion), model="openai/gpt-oss-120b:free"
    )

    # Act
    text = llm.complete(system="s", user="u", schema=_Schema, max_tokens=10)

    # Assert
    assert text == ""
