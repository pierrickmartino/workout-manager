"""Anthropic implementation of the completion transport (ADR-0006, #270/#271).

A deep module hiding the Anthropic SDK behind ``complete()``: it streams the response
with adaptive thinking and native ``output_format`` schema enforcement, assembles the
final text from the message's content blocks, and wraps any SDK/network failure as
``GenerationError``. Streaming is an internal transport detail — the transport returns
final text, never chunks — which keeps a large multi-week Protocol generation from
hitting HTTP/SDK timeouts (ADR-0005).

``complete`` returns a ``CompletionResult`` (text + normalized ``TokenUsage`` + model) so
the ``RecordingStructuredLLM`` decorator can capture usage the SDK would otherwise
discard; the public ``StructuredLLM.complete -> str`` contract is upheld by that decorator,
not here. Anthropic is the default provider, so it extracts *real* token counts from the
SDK message's ``usage``; the other three providers report empty usage until slice #2."""

from __future__ import annotations

from pydantic import BaseModel

from app.generation.llm.port import GenerationError
from app.generation.llm.usage import CompletionResult, TokenUsage


def extract_anthropic_usage(message) -> TokenUsage:
    """Normalize the Anthropic SDK message's ``usage`` into ``TokenUsage``.

    Defensive by ``getattr``: a message without a ``usage`` (or without a field) yields
    empty usage rather than raising, so a usage-shape change never breaks generation."""

    usage = getattr(message, "usage", None)
    if usage is None:
        return TokenUsage.empty()
    return TokenUsage(
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
    )


class AnthropicStructuredLLM:
    """Constrains output to ``schema`` via Claude, streamed and schema-enforced.

    The ``model`` is fixed per deployment (resolved by the factory from settings);
    ``max_tokens`` stays per-call so each generator keeps its own budget."""

    def __init__(self, client, *, model: str) -> None:
        self._client = client
        self._model = model

    def complete(
        self,
        *,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int,
    ) -> CompletionResult:
        try:
            with self._client.messages.stream(
                model=self._model,
                max_tokens=max_tokens,
                thinking={"type": "adaptive"},
                system=system,
                messages=[{"role": "user", "content": user}],
                output_format=schema,
            ) as stream:
                message = stream.get_final_message()
        except Exception as exc:  # network / API failure
            raise GenerationError(f"generation request failed: {exc}") from exc

        text = "".join(
            block.text for block in message.content if block.type == "text"
        )
        return CompletionResult(
            text=text, usage=extract_anthropic_usage(message), model=self._model
        )


__all__ = ["AnthropicStructuredLLM", "extract_anthropic_usage"]
