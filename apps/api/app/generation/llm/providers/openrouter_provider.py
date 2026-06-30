"""OpenRouter implementation of the ``StructuredLLM`` port (ADR-0006).

OpenRouter speaks the OpenAI wire protocol, so this provider *is* the OpenAI SDK
client pointed at OpenRouter's base URL. ``OpenRouterStructuredLLM`` is a thin
subclass of the OpenAI provider that reuses its streaming, ``response_format``
structured output, ``choices[].message.content`` extraction, and error wrapping
unchanged — a distinct, assertable provider type with no ``openai``
re-implementation.

OpenRouter's schema enforcement is best-effort — it depends on the routed model
— so the per-generator ``parse_*`` boundary stays the guarantee that malformed
or non-conforming output never persists (it is raised as ``GenerationError``
exactly as for any other provider)."""

from __future__ import annotations

import openai

from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM

# OpenRouter's OpenAI-compatible endpoint; the only thing distinguishing this
# provider from plain OpenAI is the base URL the SDK client is pointed at.
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterStructuredLLM(OpenAIStructuredLLM):
    """OpenRouter via the OpenAI wire path.

    Inherits ``complete()`` from :class:`OpenAIStructuredLLM` verbatim — streaming,
    ``response_format`` schema enforcement, content extraction, and SDK-error
    wrapping are identical — while remaining a distinct type the factory and
    tests can dispatch on."""


def build_openrouter_client(api_key: str) -> openai.OpenAI:
    """Construct the OpenAI SDK client pointed at OpenRouter's base URL."""

    return openai.OpenAI(api_key=api_key, base_url=OPENROUTER_BASE_URL)


__all__ = [
    "OpenRouterStructuredLLM",
    "build_openrouter_client",
    "OPENROUTER_BASE_URL",
]
