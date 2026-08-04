"""The ``RecordingStructuredLLM`` decorator — where AI-usage capture lives (#270/#271).

One place records every metered provider call. This decorator wraps a ``CompletionProvider``
and *is* the public ``StructuredLLM`` the factory returns: it times the call, assembles a
``GenerationCall`` (on success from the provider's ``CompletionResult``; on ``GenerationError``
with the failure outcome), hands it to the injected recorder **best-effort**, and returns
just the text — so the public ``complete(...) -> str`` contract and each generator's
``parse_*`` boundary are untouched (ADR-0006).

Best-effort is load-bearing: a recorder that raises is swallowed-and-logged and never turns
a good generation into an error, so monitoring can never take down the thing it monitors."""

from __future__ import annotations

import logging
import time

from pydantic import BaseModel

from app.generation.llm.port import GenerationError
from app.generation.llm.usage import CompletionProvider, TokenUsage
from app.generation.monitoring.call import (
    GenerationCall,
    GenerationCallContext,
    GenerationOutcome,
)
from app.generation.monitoring.recorder import GenerationCallRecorder

logger = logging.getLogger(__name__)


class RecordingStructuredLLM:
    """Wraps a provider, records each metered call, and returns the port's ``str``.

    ``provider_name`` and ``model`` are supplied by the factory (which knows both) so a
    *failed* call — where there is no ``CompletionResult`` to read a model from — is still
    recorded with a complete envelope."""

    def __init__(
        self,
        provider: CompletionProvider,
        *,
        recorder: GenerationCallRecorder,
        provider_name: str,
        model: str,
    ) -> None:
        self._provider = provider
        self._recorder = recorder
        self._provider_name = provider_name
        self._model = model

    def complete(
        self,
        *,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int,
        context: GenerationCallContext,
    ) -> str:
        started = time.monotonic()
        try:
            result = self._provider.complete(
                system=system, user=user, schema=schema, max_tokens=max_tokens
            )
        except GenerationError:
            # Record the failure (best-effort) then re-raise the original error
            # unchanged — the caller's parse_* boundary and error contract are intact.
            self._record(
                context=context,
                usage=TokenUsage.empty(),
                model=self._model,
                latency_ms=self._elapsed_ms(started),
                outcome=GenerationOutcome.ERROR,
                system=system,
                user=user,
                output_text=None,
            )
            raise

        self._record(
            context=context,
            usage=result.usage,
            model=result.model,
            latency_ms=self._elapsed_ms(started),
            outcome=GenerationOutcome.SUCCESS,
            system=system,
            user=user,
            output_text=result.text,
        )
        return result.text

    def flush(self) -> None:
        """Force the recorder to flush batched events, best-effort (worker end-of-job).

        Generation is async on a cache miss (ADR-0005), so the RQ job flushes here before
        its process exits. A flush failure is swallowed-and-logged: like recording, it must
        never turn a good generation into an error."""

        try:
            self._recorder.flush()
        except Exception:  # best-effort — a flush failure never propagates
            logger.exception("failed to flush generation call recorder")

    @staticmethod
    def _elapsed_ms(started: float) -> float:
        return (time.monotonic() - started) * 1000.0

    def _record(
        self,
        *,
        context: GenerationCallContext,
        usage: TokenUsage,
        model: str,
        latency_ms: float,
        outcome: GenerationOutcome,
        system: str,
        user: str,
        output_text: str | None,
    ) -> None:
        """Assemble the ``GenerationCall`` and hand it to the recorder best-effort.

        A recorder failure is swallowed-and-logged: monitoring must never change the value
        ``complete`` returns nor turn a good generation into an error."""

        call = GenerationCall(
            generator_kind=context.generator_kind,
            clerk_user_id=context.clerk_user_id,
            provider=self._provider_name,
            model=model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            latency_ms=latency_ms,
            outcome=outcome,
            system_prompt=system,
            user_prompt=user,
            output_text=output_text,
        )
        try:
            self._recorder.record(call)
        except Exception:  # best-effort — a recorder failure never propagates
            logger.exception("failed to record generation call")


__all__ = ["RecordingStructuredLLM"]
