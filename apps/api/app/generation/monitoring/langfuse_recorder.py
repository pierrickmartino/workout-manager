"""The production ``GenerationCallRecorder`` backed by self-hosted Langfuse (ADR-0039).

This is the one place the observability vendor is spoken to. It maps a ``Generation Call``
to a **flat** Langfuse trace — one trace per call, no nesting (ADR-0039 v1) — with a single
generation under it, and hands it to the injected low-level Langfuse client. Keeping the SDK
behind this port means Langfuse never leaks into generators (no ``@observe`` decorators): the
factory constructs the real client, tests inject a fake, and the offline suite stays offline.

Three properties are load-bearing:

- **``user_id`` stamped on the trace.** Every trace carries Langfuse's first-class
  ``user_id = clerk_user_id`` (``None`` for unattributed calls like catalog enrichment), so a
  user's traces are addressable for the 90-day retention window and per-user erasure.
- **Full prompt + output captured.** Self-hosting keeps the (health-influenced) prompts on the
  operator's own infrastructure, so system prompt, user prompt, and model output are recorded
  in full — the reason to adopt Langfuse over a two-integer token table.
- **Tokens + model only, never cost.** The app emits token counts and the model name; per-model
  prices live in the self-hosted Langfuse instance, which computes cost. The app never carries a
  pricing table that goes stale on a provider price change."""

from __future__ import annotations

from typing import Any, Protocol

from app.generation.monitoring.call import GenerationCall, GenerationOutcome

# Langfuse's usage-unit marker: these are token counts, not a currency amount. It is the
# *only* usage key we send besides the raw counts — deliberately no cost/price fields, so
# Langfuse (which owns pricing) computes cost and the app never knows about money.
_TOKEN_UNIT = "TOKENS"

# Langfuse observation levels: a failed metered call is surfaced as an error observation so
# the operator's failure-rate view is honest, while successes stay at the default level.
_LEVEL_DEFAULT = "DEFAULT"
_LEVEL_ERROR = "ERROR"


class LangfuseTrace(Protocol):
    """The trace handle the low-level client returns — nests one generation.

    ``id`` is the durable trace id the recorder returns as the call's lineage handle
    (#274); the real low-level ``StatefulTraceClient`` exposes it structurally."""

    id: str

    def generation(self, **kwargs: Any) -> Any: ...


class LangfuseClient(Protocol):
    """The slice of the low-level Langfuse SDK this recorder depends on.

    Declared as a narrow ``Protocol`` so the real ``langfuse.Langfuse`` client conforms
    structurally and tests can inject a fake with no SDK installed — the same offline
    discipline as the injected fake LLM."""

    def trace(self, **kwargs: Any) -> LangfuseTrace: ...

    def flush(self) -> None: ...


class LangfuseGenerationCallRecorder:
    """Records a ``Generation Call`` as a flat Langfuse trace + generation."""

    def __init__(self, client: LangfuseClient) -> None:
        self._client = client

    def record(self, call: GenerationCall) -> str | None:
        """Map one call to one trace (``user_id`` stamped) with one generation under it.

        Returns the created trace's id — the call's lineage handle carried onto the
        Generated artifact and along the adopt/regeneration chain (#274)."""

        trace = self._client.trace(
            name="generation",
            user_id=call.clerk_user_id,
            metadata={"generator_kind": call.generator_kind.value},
        )
        trace.generation(
            name=call.generator_kind.value,
            model=call.model,
            input={"system": call.system_prompt, "user": call.user_prompt},
            output=call.output_text,
            usage=self._usage(call),
            level=self._level(call),
            metadata={
                "provider": call.provider,
                "generator_kind": call.generator_kind.value,
                "outcome": call.outcome.value,
                "latency_ms": call.latency_ms,
            },
        )
        return trace.id

    def flush(self) -> None:
        """Force Langfuse's batched events out — called by the RQ worker at job end."""

        self._client.flush()

    @staticmethod
    def _usage(call: GenerationCall) -> dict[str, Any]:
        """Tokens + unit only. No cost/price field — Langfuse owns pricing."""

        return {
            "input": call.input_tokens,
            "output": call.output_tokens,
            "unit": _TOKEN_UNIT,
        }

    @staticmethod
    def _level(call: GenerationCall) -> str:
        if call.outcome is GenerationOutcome.ERROR:
            return _LEVEL_ERROR
        return _LEVEL_DEFAULT


__all__ = ["LangfuseGenerationCallRecorder", "LangfuseClient", "LangfuseTrace"]
