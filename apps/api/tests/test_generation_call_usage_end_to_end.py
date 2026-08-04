"""A ``Generation Call`` carries real token counts under every provider (#270/#272).

Slice #271 wired the recording spine and proved it for the default (Anthropic) provider;
slice #272 fills in usage extraction for the other three. These tests exercise the whole
spine — a *real* provider (fed a fake SDK client so no network is contacted) wrapped by the
real ``RecordingStructuredLLM`` decorator and a capturing recorder — and pin the acceptance
criterion that binds the slice together: for a normal completion under any of the four
providers, the recorded ``Generation Call`` carries non-empty input/output token counts.

Each provider's own extraction (SDK-shape mapping, defensiveness) is pinned in isolation in
its ``test_*_provider.py``; here we only assert the counts survive the whole path."""

from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.generation.llm.providers.anthropic_provider import AnthropicStructuredLLM
from app.generation.llm.providers.google_provider import GoogleStructuredLLM
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM
from app.generation.llm.providers.openrouter_provider import OpenRouterStructuredLLM
from app.generation.monitoring.call import (
    GenerationCallContext,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.recording_llm import RecordingStructuredLLM


class _Schema(BaseModel):
    value: str


class _CapturingRecorder:
    def __init__(self) -> None:
        self.recorded: list = []

    def record(self, call) -> None:
        self.recorded.append(call)


# --- Anthropic fake SDK -----------------------------------------------------


class _AnthropicUsage:
    def __init__(self, input_tokens: int, output_tokens: int) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _TextBlock:
    type = "text"

    def __init__(self, text: str) -> None:
        self.text = text


class _AnthropicMessage:
    def __init__(self, text: str, usage: _AnthropicUsage) -> None:
        self.content = [_TextBlock(text)]
        self.usage = usage


class _AnthropicStreamCtx:
    def __init__(self, message: _AnthropicMessage) -> None:
        self._message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self) -> _AnthropicMessage:
        return self._message


class _AnthropicMessages:
    def stream(self, **kwargs):
        return _AnthropicStreamCtx(
            _AnthropicMessage(
                '{"value": "ok"}', _AnthropicUsage(input_tokens=120, output_tokens=45)
            )
        )


class _AnthropicClient:
    messages = _AnthropicMessages()


# --- OpenAI / OpenRouter fake SDK -------------------------------------------


class _OpenAIUsage:
    def __init__(self, prompt_tokens: int, completion_tokens: int) -> None:
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens


class _OpenAIMessage:
    content = '{"value": "ok"}'


class _OpenAIChoice:
    message = _OpenAIMessage()


class _OpenAICompletion:
    choices = [_OpenAIChoice()]
    usage = _OpenAIUsage(prompt_tokens=200, completion_tokens=64)


class _OpenAIStreamCtx:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_completion(self) -> _OpenAICompletion:
        return _OpenAICompletion()


class _OpenAICompletions:
    def stream(self, **kwargs):
        return _OpenAIStreamCtx()


class _OpenAIChat:
    completions = _OpenAICompletions()


class _OpenAIClient:
    chat = _OpenAIChat()


# --- Google (Gemini) fake SDK -----------------------------------------------


class _GeminiUsageMetadata:
    prompt_token_count = 150
    candidates_token_count = 42


class _GeminiChunk:
    def __init__(self, text: str, usage_metadata=None) -> None:
        self.text = text
        self.usage_metadata = usage_metadata


class _GeminiModels:
    def generate_content_stream(self, **kwargs):
        return iter(
            [
                _GeminiChunk('{"value":'),
                _GeminiChunk(' "ok"}', usage_metadata=_GeminiUsageMetadata()),
            ]
        )


class _GeminiClient:
    models = _GeminiModels()


_CONTEXT = GenerationCallContext(
    generator_kind=GeneratorKind.PROTOCOL, clerk_user_id="user_abc"
)


def _providers():
    return [
        (
            "anthropic",
            AnthropicStructuredLLM(_AnthropicClient(), model="claude-x"),
            (120, 45),
        ),
        ("openai", OpenAIStructuredLLM(_OpenAIClient(), model="gpt-5.5"), (200, 64)),
        (
            "openrouter",
            OpenRouterStructuredLLM(_OpenAIClient(), model="some/routed"),
            (200, 64),
        ),
        (
            "google",
            GoogleStructuredLLM(_GeminiClient(), model="gemini-3.1-pro"),
            (150, 42),
        ),
    ]


@pytest.mark.parametrize(
    "provider_name,provider,expected",
    _providers(),
    ids=[case[0] for case in _providers()],
)
def test_generation_call_carries_non_empty_usage_for_each_provider(
    provider_name, provider, expected
):
    # Arrange — the real provider (fake SDK) behind the real recording decorator
    recorder = _CapturingRecorder()
    llm = RecordingStructuredLLM(
        provider, recorder=recorder, provider_name=provider_name, model="configured"
    )

    # Act
    text = llm.complete(
        system="s", user="u", schema=_Schema, max_tokens=100, context=_CONTEXT
    )

    # Assert — the assembled text is returned unchanged, and the recorded call
    # carries this provider's real, non-empty token counts
    assert text == '{"value": "ok"}'
    assert len(recorder.recorded) == 1
    call = recorder.recorded[0]
    assert call.outcome == GenerationOutcome.SUCCESS
    assert (call.input_tokens, call.output_tokens) == expected
    assert call.input_tokens is not None and call.output_tokens is not None
