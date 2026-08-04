"""The ``StructuredLLM`` transport port (ADR-0006).

Every AI generation in the app goes through this one provider-agnostic seam.
``complete`` passes the Pydantic ``schema`` to the provider to *constrain*
output and returns the raw JSON **text** — deliberately a string, not a parsed
object, so each generator keeps its own ``parse_*`` boundary validation in
exactly one place. Concrete providers live in ``app.generation.llm.providers``
and are constructed only by ``build_llm_client`` (the factory)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from pydantic import BaseModel

if TYPE_CHECKING:
    # Type-only import: ``from __future__ import annotations`` keeps the annotation a
    # string, so the port carries no runtime dependency on the monitoring concern.
    from app.generation.monitoring.call import GenerationCallContext


class GenerationError(Exception):
    """Raised when a generation cannot be produced or validated.

    Lives with the transport contract: a provider raises it on an SDK/network
    failure, and each generator's ``parse_*`` boundary raises it on output that
    cannot be validated into the schema."""


class StructuredLLM(Protocol):
    def complete(
        self,
        *,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int,
        context: GenerationCallContext,
    ) -> str:
        """Generate output constrained to ``schema`` and return the raw JSON text.

        The provider uses its strongest native structured-output mechanism to
        constrain the response to ``schema`` and returns the assembled text. It
        raises ``GenerationError`` on a transport/SDK failure; the caller's
        ``parse_*`` boundary is the net for malformed or non-conforming text.

        ``context`` is the additive, provider-agnostic parameter (generator kind +
        nullable ``clerk_user_id``) the recording decorator captures per call; the
        return type stays ``str`` so the ``parse_*`` boundary does not move (ADR-0006).
        """
        ...


__all__ = ["StructuredLLM", "GenerationError"]
