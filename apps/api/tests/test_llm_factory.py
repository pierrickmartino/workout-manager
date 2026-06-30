"""The ``build_llm_client`` factory (ADR-0006).

The factory is the single place a concrete SDK client is constructed and the
single dispatch on ``AI_PROVIDER``. It fails fast when the *selected* provider's
key is missing, tolerates absent keys for *other* providers, and surfaces a
clear error for an unknown or not-yet-wired provider. These tests pin that
dispatch and the fail-fast contract without a network call."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.generation.llm.factory import build_llm_client
from app.generation.llm.providers.anthropic_provider import AnthropicStructuredLLM
from app.generation.llm.providers.google_provider import GoogleStructuredLLM
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM


def test_anthropic_provider_builds_a_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="anthropic", anthropic_api_key="sk-test")

    # Act
    client = build_llm_client(settings)

    # Assert — the Anthropic StructuredLLM is returned, resolved to its model
    assert isinstance(client, AnthropicStructuredLLM)
    assert client._model == "claude-opus-4-8"


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
    assert isinstance(build_llm_client(settings), AnthropicStructuredLLM)


def test_openai_provider_builds_a_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="openai", openai_api_key="sk-openai")

    # Act
    client = build_llm_client(settings)

    # Assert — the OpenAI StructuredLLM is returned, resolved to its model
    assert isinstance(client, OpenAIStructuredLLM)
    assert client._model == "gpt-5.5"


def test_missing_openai_key_fails_fast():
    # Arrange — openai selected but its key is absent
    settings = Settings(ai_provider="openai", openai_api_key="")

    # Act / Assert — startup-time failure with a clear message
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        build_llm_client(settings)


def test_google_provider_builds_a_structured_llm():
    # Arrange — only the selected provider's key is set
    settings = Settings(ai_provider="google", google_api_key="key-google")

    # Act
    client = build_llm_client(settings)

    # Assert — the Google StructuredLLM is returned, resolved to its model
    assert isinstance(client, GoogleStructuredLLM)
    assert client._model == "gemini-3.1-pro"


def test_missing_google_key_fails_fast():
    # Arrange — google selected but its key is absent
    settings = Settings(ai_provider="google", google_api_key="")

    # Act / Assert — startup-time failure with a clear message
    with pytest.raises(ValueError, match="GOOGLE_API_KEY"):
        build_llm_client(settings)


def test_unknown_provider_fails_fast():
    # Arrange — a typo'd provider selector
    settings = Settings(ai_provider="claude", anthropic_api_key="sk-test")

    # Act / Assert
    with pytest.raises(ValueError, match="unknown AI_PROVIDER"):
        build_llm_client(settings)


def test_known_but_unwired_provider_fails_fast():
    # Arrange — a provider documented in the ADR but not wired yet (openrouter)
    settings = Settings(ai_provider="openrouter", openrouter_api_key="key-openrouter")

    # Act / Assert — clear "not yet supported" error, not a silent fallback
    with pytest.raises(NotImplementedError, match="openrouter"):
        build_llm_client(settings)
