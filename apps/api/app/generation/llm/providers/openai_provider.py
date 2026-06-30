"""OpenAI implementation of the ``StructuredLLM`` port (ADR-0006).

A deep module hiding the OpenAI SDK behind ``complete()``: it streams the
response with strict ``json_schema`` structured output (the Pydantic schema is
passed as ``response_format``, which the SDK serializes into a strict JSON
schema), assembles the final completion, extracts the text from
``choices[].message.content``, and wraps any SDK/network failure as
``GenerationError``. Streaming is an internal transport detail — the port
returns final text, never chunks — preserving the ADR-0005 rationale that a
large multi-week Program generation must not hit HTTP/SDK timeouts."""

from __future__ import annotations

from pydantic import BaseModel

from app.generation.llm.port import GenerationError


class OpenAIStructuredLLM:
    """Constrains output to ``schema`` via OpenAI, streamed and schema-enforced.

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
            with self._client.chat.completions.stream(
                model=self._model,
                max_completion_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format=schema,
            ) as stream:
                completion = stream.get_final_completion()
        except Exception as exc:  # network / API failure
            raise GenerationError(f"generation request failed: {exc}") from exc

        return completion.choices[0].message.content or ""


__all__ = ["OpenAIStructuredLLM"]
