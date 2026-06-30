"""Anthropic implementation of the ``StructuredLLM`` port (ADR-0006).

A deep module hiding the Anthropic SDK behind ``complete()``: it streams the
response with adaptive thinking and native ``output_format`` schema enforcement,
assembles the final text from the message's content blocks, and wraps any
SDK/network failure as ``GenerationError``. Streaming is an internal transport
detail — the port returns final text, never chunks — which keeps a large
multi-week Program generation from hitting HTTP/SDK timeouts (ADR-0005)."""

from __future__ import annotations

from pydantic import BaseModel

from app.generation.llm.port import GenerationError


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
    ) -> str:
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

        return "".join(
            block.text for block in message.content if block.type == "text"
        )


__all__ = ["AnthropicStructuredLLM"]
