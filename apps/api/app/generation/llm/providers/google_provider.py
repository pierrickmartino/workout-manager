"""Google (Gemini) implementation of the ``StructuredLLM`` port (ADR-0006).

A deep module hiding the ``google-genai`` SDK behind ``complete()``: it streams
the response with Gemini's native ``response_schema`` enforcement plus a JSON
response mime type, assembles the final text from the streamed chunks' ``.text``,
and wraps any SDK/network failure as ``GenerationError``. Streaming is an
internal transport detail — the port returns final text, never chunks — which
keeps a large multi-week Protocol generation from hitting HTTP/SDK timeouts
(ADR-0005)."""

from __future__ import annotations

from pydantic import BaseModel

from app.generation.llm.port import GenerationError
from app.generation.llm.usage import CompletionResult, TokenUsage


def extract_google_usage(usage_metadata) -> TokenUsage:
    """Normalize a Gemini ``usage_metadata`` into ``TokenUsage``.

    Maps the SDK's native names — ``prompt_token_count`` (input),
    ``candidates_token_count`` (output) — onto the normalized shape. Defensive by
    ``getattr``: a ``None`` metadata (no chunk reported usage) or a missing field
    yields empty usage rather than raising, so a usage-shape change never breaks
    generation."""

    if usage_metadata is None:
        return TokenUsage.empty()
    return TokenUsage(
        input_tokens=getattr(usage_metadata, "prompt_token_count", None),
        output_tokens=getattr(usage_metadata, "candidates_token_count", None),
    )


class GoogleStructuredLLM:
    """Constrains output to ``schema`` via Gemini, streamed and schema-enforced.

    The ``model`` is fixed per deployment (resolved by the factory from settings);
    ``max_tokens`` stays per-call so each generator keeps its own budget.

    ``complete`` returns a ``CompletionResult`` (text + usage + model) consumed by the
    ``RecordingStructuredLLM`` decorator, extracting real token counts from the stream's
    cumulative ``usage_metadata`` (:func:`extract_google_usage`)."""

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
            text_parts: list[str] = []
            # Gemini reports usage cumulatively; the last chunk carrying
            # usage_metadata holds the final totals, so keep the latest seen.
            usage_metadata = None
            for chunk in stream:
                if chunk.text:
                    text_parts.append(chunk.text)
                chunk_usage = getattr(chunk, "usage_metadata", None)
                if chunk_usage is not None:
                    usage_metadata = chunk_usage
            text = "".join(text_parts)
        except Exception as exc:  # network / API failure
            raise GenerationError(f"generation request failed: {exc}") from exc

        return CompletionResult(
            text=text, usage=extract_google_usage(usage_metadata), model=self._model
        )


__all__ = ["GoogleStructuredLLM", "extract_google_usage"]
