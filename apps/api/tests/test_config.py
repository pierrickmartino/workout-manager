"""AI provider settings resolution (ADR-0006).

Each deployment selects a provider via ``AI_PROVIDER`` and gets that provider's
default model unless ``AI_MODEL`` overrides it. These tests pin the resolution
and override precedence without touching the environment — settings are
constructed explicitly."""

from __future__ import annotations

import pytest

from app.config import Settings


def test_anthropic_resolves_to_its_default_model():
    # Arrange / Act
    settings = Settings(ai_provider="anthropic")

    # Assert
    assert settings.resolved_model() == "claude-opus-4-8"


def test_each_provider_has_its_default_model():
    # Assert — the documented per-provider defaults (ADR-0006)
    assert Settings(ai_provider="openai").resolved_model() == "gpt-5.5"
    assert Settings(ai_provider="google").resolved_model() == "gemini-3.1-pro"
    assert (
        Settings(ai_provider="openrouter").resolved_model()
        == "openai/gpt-oss-120b:free"
    )


def test_ai_model_overrides_the_provider_default():
    # Arrange — pin a specific model regardless of provider default
    settings = Settings(ai_provider="anthropic", ai_model="claude-sonnet-4-6")

    # Act / Assert
    assert settings.resolved_model() == "claude-sonnet-4-6"


def test_ai_model_overrides_the_openrouter_default():
    # Arrange — OpenRouter routes any model id; AI_MODEL pins which one
    settings = Settings(ai_provider="openrouter", ai_model="anthropic/claude-opus-4-8")

    # Act / Assert
    assert settings.resolved_model() == "anthropic/claude-opus-4-8"


def test_unknown_provider_resolution_raises():
    # Arrange — a typo'd provider has no default model
    settings = Settings(ai_provider="claude")

    # Act / Assert
    with pytest.raises(ValueError):
        settings.resolved_model()


def test_langfuse_is_unconfigured_by_default():
    # Arrange / Act — no Langfuse env set (the offline default)
    settings = Settings()

    # Assert — monitoring is optional infrastructure; absent means no-op recorder
    assert settings.langfuse_configured() is False


def test_langfuse_is_configured_only_when_host_and_both_keys_present():
    # Arrange — self-hosted Langfuse needs a host and both credentials
    settings = Settings(
        langfuse_host="https://langfuse.internal",
        langfuse_public_key="pk-1",
        langfuse_secret_key="sk-1",
    )

    # Act / Assert
    assert settings.langfuse_configured() is True


def test_langfuse_is_unconfigured_when_any_field_is_missing():
    # Assert — a partial configuration is not "configured" (fail closed to no-op)
    assert (
        Settings(
            langfuse_public_key="pk-1", langfuse_secret_key="sk-1"
        ).langfuse_configured()
        is False
    )
    assert (
        Settings(
            langfuse_host="https://langfuse.internal", langfuse_secret_key="sk-1"
        ).langfuse_configured()
        is False
    )
    assert (
        Settings(
            langfuse_host="https://langfuse.internal", langfuse_public_key="pk-1"
        ).langfuse_configured()
        is False
    )
