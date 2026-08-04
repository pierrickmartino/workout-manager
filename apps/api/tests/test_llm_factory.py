"""The ``build_llm_client`` factory (ADR-0006, #270/#271).

The factory is the single place a concrete SDK client is constructed and the
single dispatch on ``AI_PROVIDER``. It fails fast when the *selected* provider's
key is missing, tolerates absent keys for *other* providers, and surfaces a
clear error for an unknown or not-yet-wired provider. It also wraps the chosen
provider in the ``RecordingStructuredLLM`` decorator with the no-op recorder, so
every metered call is captured in one place while an unconfigured deployment
records nothing. These tests pin that dispatch, the wrapping, and the fail-fast
contract without a network call."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.generation.llm.factory import build_llm_client, build_recorder
from app.generation.llm.providers.anthropic_provider import AnthropicStructuredLLM
from app.generation.llm.providers.google_provider import GoogleStructuredLLM
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM
from app.generation.llm.providers.openrouter_provider import OpenRouterStructuredLLM
from app.generation.monitoring.langfuse_recorder import LangfuseGenerationCallRecorder
from app.generation.monitoring.recorder import NoOpGenerationCallRecorder
from app.generation.monitoring.recording_llm import RecordingStructuredLLM


def _assert_wraps(client, provider_type, *, provider_name, model):
    """The factory returns a recording decorator wrapping the provider, no-op recorder."""

    assert isinstance(client, RecordingStructuredLLM)
    assert isinstance(client._provider, provider_type)
    assert client._provider._model == model
    assert client._provider_name == provider_name
    assert client._model == model
    assert isinstance(client._recorder, NoOpGenerationCallRecorder)


def test_anthropic_provider_builds_a_recording_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="anthropic", anthropic_api_key="sk-test")

    # Act
    client = build_llm_client(settings)

    # Assert — the Anthropic provider, wrapped and resolved to its model
    _assert_wraps(
        client,
        AnthropicStructuredLLM,
        provider_name="anthropic",
        model="claude-opus-4-8",
    )


def test_missing_selected_provider_key_fails_fast():
    # Arrange — anthropic selected but its key is absent
    settings = Settings(ai_provider="anthropic", anthropic_api_key="")

    # Act / Assert — startup-time failure with a clear message
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        build_llm_client(settings)


def test_absent_keys_for_other_providers_are_tolerated():
    # Arrange — anthropic selected and keyed; no OpenAI/Google/OpenRouter keys
    settings = Settings(ai_provider="anthropic", anthropic_api_key="sk-test")

    # Act / Assert — does not raise despite the other keys being empty
    client = build_llm_client(settings)
    assert isinstance(client, RecordingStructuredLLM)
    assert isinstance(client._provider, AnthropicStructuredLLM)


def test_openai_provider_builds_a_recording_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="openai", openai_api_key="sk-openai")

    # Act
    client = build_llm_client(settings)

    # Assert — the OpenAI provider, wrapped and resolved to its model
    _assert_wraps(
        client, OpenAIStructuredLLM, provider_name="openai", model="gpt-5.5"
    )


def test_missing_openai_key_fails_fast():
    # Arrange — openai selected but its key is absent
    settings = Settings(ai_provider="openai", openai_api_key="")

    # Act / Assert — startup-time failure with a clear message
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        build_llm_client(settings)


def test_google_provider_builds_a_recording_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="google", google_api_key="key-google")

    # Act
    client = build_llm_client(settings)

    # Assert — the Google provider, wrapped and resolved to its model
    _assert_wraps(
        client, GoogleStructuredLLM, provider_name="google", model="gemini-3.1-pro"
    )


def test_missing_google_key_fails_fast():
    # Arrange — google selected but its key is absent
    settings = Settings(ai_provider="google", google_api_key="")

    # Act / Assert — startup-time failure with a clear message
    with pytest.raises(ValueError, match="GOOGLE_API_KEY"):
        build_llm_client(settings)


def test_openrouter_provider_builds_a_recording_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="openrouter", openrouter_api_key="key-openrouter")

    # Act
    client = build_llm_client(settings)

    # Assert — the OpenRouter provider, wrapped and resolved to its model
    _assert_wraps(
        client,
        OpenRouterStructuredLLM,
        provider_name="openrouter",
        model="openai/gpt-oss-120b:free",
    )


def test_missing_openrouter_key_fails_fast():
    # Arrange — openrouter selected but its key is absent
    settings = Settings(ai_provider="openrouter", openrouter_api_key="")

    # Act / Assert — startup-time failure with a clear message
    with pytest.raises(ValueError, match="OPENROUTER_API_KEY"):
        build_llm_client(settings)


def test_unknown_provider_fails_fast():
    # Arrange — a typo'd provider selector
    settings = Settings(ai_provider="claude", anthropic_api_key="sk-test")

    # Act / Assert
    with pytest.raises(ValueError, match="unknown AI_PROVIDER"):
        build_llm_client(settings)


def test_recorder_is_noop_when_langfuse_is_not_configured():
    # Arrange — the offline default: no Langfuse configured
    settings = Settings()

    # Act — the SDK-client builder must not even be consulted on the no-op path
    recorder = build_recorder(
        settings,
        langfuse_client_builder=_unused_client_builder,
    )

    # Assert — records nothing, contacts no network
    assert isinstance(recorder, NoOpGenerationCallRecorder)


def test_recorder_is_langfuse_when_configured():
    # Arrange — Langfuse fully configured; inject a fake SDK client so no network/SDK
    settings = Settings(
        langfuse_host="https://langfuse.internal",
        langfuse_public_key="pk-1",
        langfuse_secret_key="sk-1",
    )
    seen: list[Settings] = []

    def _fake_builder(s: Settings) -> object:
        seen.append(s)
        return object()  # stands in for the low-level Langfuse client

    # Act
    recorder = build_recorder(settings, langfuse_client_builder=_fake_builder)

    # Assert — the Langfuse-backed recorder, built from the configured settings
    assert isinstance(recorder, LangfuseGenerationCallRecorder)
    assert seen == [settings]


def _unused_client_builder(settings: Settings) -> object:
    raise AssertionError("langfuse client must not be built when unconfigured")
