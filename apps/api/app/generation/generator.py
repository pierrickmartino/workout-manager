"""Standalone Session generation (ADR-0006).

``SessionGenerator`` is the port the rest of the app depends on; the concrete
``LlmSessionGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport, constrained to the ``GeneratedSession`` JSON schema. Whatever the
provider, output crosses the boundary through ``parse_generated_session``, which
validates it against the schema and raises ``GenerationError`` on anything
malformed — so an unparseable generation is handled, never passed downstream."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from pydantic import ValidationError

from app.generation.llm.port import GenerationError, StructuredLLM
from app.generation.schema import GeneratedSession

MAX_TOKENS = 8000


@dataclass(frozen=True)
class GenerationRequest:
    """A request for one standalone Session: type, duration, and equipment."""

    training_type: str
    duration_minutes: int
    equipment: list[str] = field(default_factory=list)


class SessionGenerator(Protocol):
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        """Produce a schema-valid Session for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def parse_generated_session(raw_json: str) -> GeneratedSession:
    """Validate raw model output against the schema at the boundary.

    Returns the typed ``GeneratedSession`` on success; raises ``GenerationError``
    for invalid JSON or any schema violation, so callers never persist
    half-formed generations.
    """

    try:
        return GeneratedSession.model_validate_json(raw_json)
    except ValidationError as exc:
        raise GenerationError(f"generation did not match the schema: {exc}") from exc


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. Generate a single, standalone "
        "training Session as a set of Exercise Prescriptions. For each prescription "
        "give the exercise name, a short description, targeted muscles, required "
        "equipment, and the sets, reps, rest (seconds), tempo, and recommended load. "
        "Only prescribe exercises that fit the requested training type, duration, and "
        "the available equipment. Respond strictly in the required JSON schema."
    )


def _user_prompt(request: GenerationRequest) -> str:
    equipment = ", ".join(request.equipment) if request.equipment else "bodyweight only"
    return (
        f"Training type: {request.training_type}\n"
        f"Duration: {request.duration_minutes} minutes\n"
        f"Available equipment: {equipment}"
    )


class LlmSessionGenerator:
    """Generates Sessions via the ``StructuredLLM`` transport (ADR-0006).

    The transport constrains output to ``GeneratedSession`` and returns the raw
    JSON text; this generator validates it at its ``parse_*`` boundary before
    returning, so a malformed generation raises ``GenerationError`` regardless of
    which provider produced it."""

    def __init__(self, llm: StructuredLLM) -> None:
        self._llm = llm

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        text = self._llm.complete(
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedSession,
            max_tokens=MAX_TOKENS,
        )
        return parse_generated_session(text)


__all__ = [
    "GenerationError",
    "GenerationRequest",
    "SessionGenerator",
    "LlmSessionGenerator",
    "parse_generated_session",
]
