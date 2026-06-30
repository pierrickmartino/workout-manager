"""The ``build_llm_client`` factory (ADR-0006).

This is the *only* place a concrete provider SDK client is constructed, used by
both the API DI layer and the standalone RQ worker so wiring isn't scattered. It
dispatches on ``AI_PROVIDER`` and fails fast at startup: an unknown provider, or
a missing key for the *selected* provider, raises immediately with a clear
message — a misconfigured deployment never looks healthy until someone triggers
a generation. Keys for *unselected* providers may be absent.

``anthropic``, ``openai``, ``google``, and ``openrouter`` are wired; any other
provider documented in ADR-0006 raises ``NotImplementedError`` until it is
implemented. ``openrouter`` reuses the OpenAI SDK pointed at OpenRouter's base
URL (no new dependency)."""

from __future__ import annotations

import anthropic
import openai
from google import genai

from app.config import DEFAULT_MODELS, Settings
from app.generation.llm.port import StructuredLLM
from app.generation.llm.providers.anthropic_provider import AnthropicStructuredLLM
from app.generation.llm.providers.google_provider import GoogleStructuredLLM
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM
from app.generation.llm.providers.openrouter_provider import (
    OpenRouterStructuredLLM,
    build_openrouter_client,
)

# The env var holding each provider's API key, for the fail-fast key check.
PROVIDER_KEY_FIELDS = {
    "anthropic": "anthropic_api_key",
    "openai": "openai_api_key",
    "google": "google_api_key",
    "openrouter": "openrouter_api_key",
}


def _require_key(settings: Settings, provider: str) -> str:
    """Return the selected provider's API key or fail fast if it's missing."""

    try:
        field = PROVIDER_KEY_FIELDS[provider]
    except KeyError as exc:
        raise ValueError(
            f"unknown AI_PROVIDER '{provider}'; "
            f"expected one of {sorted(DEFAULT_MODELS)}"
        ) from exc

    key = getattr(settings, field)
    if not key:
        raise ValueError(
            f"{field.upper()} is required when AI_PROVIDER={provider}"
        )
    return key


def build_llm_client(settings: Settings) -> StructuredLLM:
    """Construct the configured provider's ``StructuredLLM`` (the only SDK seam)."""

    provider = settings.ai_provider
    key = _require_key(settings, provider)

    if provider == "anthropic":
        client = anthropic.Anthropic(api_key=key)
        return AnthropicStructuredLLM(client, model=settings.resolved_model())

    if provider == "openai":
        client = openai.OpenAI(api_key=key)
        return OpenAIStructuredLLM(client, model=settings.resolved_model())

    if provider == "google":
        client = genai.Client(api_key=key)
        return GoogleStructuredLLM(client, model=settings.resolved_model())

    if provider == "openrouter":
        client = build_openrouter_client(key)
        return OpenRouterStructuredLLM(client, model=settings.resolved_model())

    raise NotImplementedError(
        f"AI_PROVIDER '{provider}' is not yet supported; "
        "wired providers: 'anthropic', 'openai', 'google', 'openrouter'"
    )


__all__ = ["build_llm_client", "PROVIDER_KEY_FIELDS"]
