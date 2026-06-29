"""Session generation through Claude (ADR-0006).

``SessionGenerator`` is the port the rest of the app depends on; the concrete
``AnthropicSessionGenerator`` calls Claude Opus 4.8 with adaptive thinking and
streaming, constrained to the ``GeneratedSession`` JSON schema. Whatever the
source, output crosses the boundary through ``parse_generated_session``, which
validates it against the schema and raises ``GenerationError`` on anything
malformed — so an unparseable generation is handled, never passed downstream."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from pydantic import ValidationError

from app.generation.schema import GeneratedSession

GENERATION_MODEL = "claude-opus-4-8"
MAX_TOKENS = 8000


class GenerationError(Exception):
    """Raised when a generation cannot be parsed/validated into the schema."""


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


class AnthropicSessionGenerator:
    """Generates Sessions via Claude, schema-constrained and streamed.

    Streaming pairs with the strict output schema (ADR-0006): the model is
    constrained to emit JSON matching ``GeneratedSession``, and the streamed text
    is validated at the boundary before it is returned."""

    def __init__(self, client) -> None:
        self._client = client

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        try:
            with self._client.messages.stream(
                model=GENERATION_MODEL,
                max_tokens=MAX_TOKENS,
                thinking={"type": "adaptive"},
                system=_system_prompt(),
                messages=[{"role": "user", "content": _user_prompt(request)}],
                output_format=GeneratedSession,
            ) as stream:
                message = stream.get_final_message()
        except Exception as exc:  # network / API failure
            raise GenerationError(f"generation request failed: {exc}") from exc

        text = "".join(
            block.text for block in message.content if block.type == "text"
        )
        return parse_generated_session(text)


__all__ = [
    "GenerationError",
    "GenerationRequest",
    "SessionGenerator",
    "AnthropicSessionGenerator",
    "parse_generated_session",
    "GENERATION_MODEL",
]
