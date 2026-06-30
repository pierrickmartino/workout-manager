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


def test_unknown_provider_resolution_raises():
    # Arrange — a typo'd provider has no default model
    settings = Settings(ai_provider="claude")

    # Act / Assert
    with pytest.raises(ValueError):
        settings.resolved_model()
