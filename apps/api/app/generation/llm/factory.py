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
URL (no new dependency).

The factory also wires operational AI-usage monitoring (#270/#273): it wraps the chosen
provider in the ``RecordingStructuredLLM`` decorator and selects a ``GenerationCallRecorder``
the same way it selects a provider — the **Langfuse-backed recorder** when Langfuse is
configured (host + both keys present), the **no-op** otherwise. So an unconfigured deployment
and the whole offline suite record nothing, contact no network, and behave exactly as before.
The Langfuse SDK is imported lazily (only when configured), so it is never needed to run the
offline suite. Both the API DI layer and the RQ worker go through here, so recording is wired
in one place."""

from __future__ import annotations

from collections.abc import Callable

import anthropic
import openai
from google import genai

from app.config import DEFAULT_MODELS, Settings
from app.generation.llm.providers.anthropic_provider import AnthropicStructuredLLM
from app.generation.llm.providers.google_provider import GoogleStructuredLLM
from app.generation.llm.providers.openai_provider import OpenAIStructuredLLM
from app.generation.llm.providers.openrouter_provider import (
    OpenRouterStructuredLLM,
    build_openrouter_client,
)
from app.generation.llm.usage import CompletionProvider
from app.generation.monitoring.langfuse_recorder import (
    LangfuseClient,
    LangfuseGenerationCallRecorder,
)
from app.generation.monitoring.recorder import (
    GenerationCallRecorder,
    NoOpGenerationCallRecorder,
)
from app.generation.monitoring.recording_llm import RecordingStructuredLLM

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


# How the Langfuse SDK client is constructed — injectable so recorder *selection* is
# unit-tested with a fake client while production builds the real one.
LangfuseClientBuilder = Callable[[Settings], LangfuseClient]


def _default_langfuse_client(settings: Settings) -> LangfuseClient:
    """Construct the real low-level Langfuse SDK client (the only place it is imported).

    Imported lazily so the SDK is a hard dependency only for a *configured* deployment; an
    unconfigured deployment and the offline suite never import it."""

    from langfuse import Langfuse

    return Langfuse(
        host=settings.langfuse_host,
        public_key=settings.langfuse_public_key,
        secret_key=settings.langfuse_secret_key,
    )


def build_recorder(
    settings: Settings,
    *,
    langfuse_client_builder: LangfuseClientBuilder = _default_langfuse_client,
) -> GenerationCallRecorder:
    """Select the AI-usage recorder: Langfuse when configured, else the no-op.

    Mirrors how ``build_llm_client`` selects a provider. The Langfuse SDK client is built
    through ``langfuse_client_builder`` — injectable so the selection is unit-tested with a
    fake client and the offline suite never touches the SDK. When Langfuse is unconfigured
    the builder is not consulted at all, so no SDK import or network happens on that path."""

    if not settings.langfuse_configured():
        return NoOpGenerationCallRecorder()
    return LangfuseGenerationCallRecorder(langfuse_client_builder(settings))


def _build_provider(settings: Settings, provider: str, key: str) -> CompletionProvider:
    """Construct the chosen provider's transport (the only place an SDK client is made)."""

    model = settings.resolved_model()

    if provider == "anthropic":
        return AnthropicStructuredLLM(anthropic.Anthropic(api_key=key), model=model)

    if provider == "openai":
        return OpenAIStructuredLLM(openai.OpenAI(api_key=key), model=model)

    if provider == "google":
        return GoogleStructuredLLM(genai.Client(api_key=key), model=model)

    if provider == "openrouter":
        return OpenRouterStructuredLLM(build_openrouter_client(key), model=model)

    raise NotImplementedError(
        f"AI_PROVIDER '{provider}' is not yet supported; "
        "wired providers: 'anthropic', 'openai', 'google', 'openrouter'"
    )


def build_llm_client(settings: Settings) -> RecordingStructuredLLM:
    """Construct the configured provider wrapped in the recording decorator.

    The chosen provider is the only SDK seam; the ``RecordingStructuredLLM`` decorator
    around it is what satisfies the public ``StructuredLLM`` port, capturing every metered
    call for AI-usage monitoring (#270). ``provider_name`` and ``model`` are passed through
    so even a *failed* call — where there is no result to read a model from — is recorded
    with a complete envelope. The concrete decorator type is returned (not just the
    ``StructuredLLM`` port) so the RQ worker can ``flush()`` the recorder at job end."""

    provider = settings.ai_provider
    key = _require_key(settings, provider)

    inner = _build_provider(settings, provider, key)
    return RecordingStructuredLLM(
        inner,
        recorder=build_recorder(settings),
        provider_name=provider,
        model=settings.resolved_model(),
    )


__all__ = ["build_llm_client", "build_recorder", "PROVIDER_KEY_FIELDS"]
