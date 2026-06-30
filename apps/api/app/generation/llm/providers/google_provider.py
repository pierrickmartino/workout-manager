"""Google (Gemini) implementation of the ``StructuredLLM`` port (ADR-0006).

A deep module hiding the ``google-genai`` SDK behind ``complete()``: it streams
the response with Gemini's native ``response_schema`` enforcement plus a JSON
response mime type, assembles the final text from the streamed chunks' ``.text``,
and wraps any SDK/network failure as ``GenerationError``. Streaming is an
internal transport detail — the port returns final text, never chunks — which
keeps a large multi-week Program generation from hitting HTTP/SDK timeouts
(ADR-0005)."""

from __future__ import annotations

from pydantic import BaseModel

from app.generation.llm.port import GenerationError


class GoogleStructuredLLM:
    """Constrains output to ``schema`` via Gemini, streamed and schema-enforced.

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
            stream = self._client.models.generate_content_stream(
                model=self._model,
                contents=user,
                config={
                    "system_instruction": system,
                    "max_output_tokens": max_tokens,
                    "response_mime_type": "application/json",
                    "response_schema": schema,
                },
            )
            return "".join(chunk.text for chunk in stream if chunk.text)
        except Exception as exc:  # network / API failure
            raise GenerationError(f"generation request failed: {exc}") from exc


__all__ = ["GoogleStructuredLLM"]
