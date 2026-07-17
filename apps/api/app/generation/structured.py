"""The shared generation plumbing: constrain-then-parse, in one place.

Every AI generator — Session, Protocol, Regeneration, Substitute,
Muscle-Emphasis — runs the same two steps around the provider-agnostic
``StructuredLLM`` transport (ADR-0006): constrain the model to a Pydantic
``schema`` and get raw JSON text back, then validate that text into the typed
model at the boundary, raising ``GenerationError`` on anything malformed so a bad
generation is never passed downstream.

This module owns those two steps so each generator carries only its own
irreducible content — its prompts, its schema, and its token budget — rather than
re-implementing the ``complete`` → ``parse`` pipeline five times. It sits *above*
the transport seam and does not touch it."""

from __future__ import annotations

from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.generation.llm.port import GenerationError, StructuredLLM

T = TypeVar("T", bound=BaseModel)


def parse_or_raise(raw_json: str, schema: type[T], *, subject: str) -> T:
    """Validate raw model output into ``schema`` at the generation boundary.

    Returns the typed model on success; raises ``GenerationError`` for invalid
    JSON or any schema violation, so callers never persist half-formed output.
    ``subject`` names the generation in the error message (e.g. ``"protocol
    generation"``).
    """

    try:
        return schema.model_validate_json(raw_json)
    except ValidationError as exc:
        raise GenerationError(f"{subject} did not match the schema: {exc}") from exc


def generate_structured(
    *,
    llm: StructuredLLM,
    system: str,
    user: str,
    schema: type[T],
    max_tokens: int,
    subject: str,
) -> T:
    """Constrain ``llm`` to ``schema``, then validate the raw output into it.

    The one deep step every generator shares: ``complete`` returns raw JSON text
    constrained to ``schema``, and ``parse_or_raise`` turns it into the typed
    model or raises ``GenerationError``. A transport/SDK failure surfaces as
    ``GenerationError`` from ``complete`` itself; malformed text surfaces from the
    parse boundary. Any generation-specific check beyond schema validity (e.g. the
    Protocol full-enumeration guarantee) stays with the caller, run on the result.
    """

    text = llm.complete(system=system, user=user, schema=schema, max_tokens=max_tokens)
    return parse_or_raise(text, schema, subject=subject)


__all__ = ["parse_or_raise", "generate_structured"]
