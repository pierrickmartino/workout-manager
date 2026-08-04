"""The provider-internal completion result and its normalized token usage (#270/#271).

The public ``StructuredLLM.complete`` returns ``str`` (ADR-0006) so each generator keeps
its single ``parse_*`` boundary. But operational AI-usage monitoring needs the token
counts a provider discards the moment it returns. So each provider now yields a small
*internal* ``CompletionResult`` — the assembled text plus a normalized ``TokenUsage`` and
the model that served it — which the ``RecordingStructuredLLM`` decorator consumes before
handing the public ``str`` back.

Usage extraction is irreducibly provider-specific (Anthropic ``message.usage``, OpenAI
``response.usage``, Gemini ``usage_metadata``); ``TokenUsage`` is the one normalized shape
the decorator depends on, so no provider quirk leaks past the transport seam."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel


@dataclass(frozen=True)
class TokenUsage:
    """Normalized input/output token counts, or ``None`` when a provider doesn't report them.

    ``None`` means *unknown* — the provider's usage extraction is not wired yet — which is
    deliberately distinct from a real zero: an operator reading the log can tell an
    un-extracted call apart from a genuinely empty one."""

    input_tokens: int | None = None
    output_tokens: int | None = None

    @classmethod
    def empty(cls) -> "TokenUsage":
        """Usage for a provider that does not yet report token counts (slice #2)."""

        return cls(input_tokens=None, output_tokens=None)


@dataclass(frozen=True)
class CompletionResult:
    """A provider's assembled text plus the usage and model the decorator records."""

    text: str
    usage: TokenUsage
    model: str


class CompletionProvider(Protocol):
    """The provider-internal transport the recording decorator wraps.

    Distinct from the public ``StructuredLLM`` port: a provider returns a
    ``CompletionResult`` (text + usage + model), and ``RecordingStructuredLLM`` is what
    turns that into the port's ``str`` *after* recording the call. Providers therefore
    carry no monitoring concern and take no ``context``."""

    def complete(
        self, *, system: str, user: str, schema: type[BaseModel], max_tokens: int
    ) -> CompletionResult: ...


__all__ = ["TokenUsage", "CompletionResult", "CompletionProvider"]
