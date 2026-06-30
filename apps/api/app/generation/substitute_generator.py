"""AI fallback for Substitution (ADR-0006).

``SubstituteGenerator`` is the port the substitution service depends on; it is
called **only** when lookup-first resolution finds no catalog Variation/Alternative
that fits the user's equipment and constraints. The concrete
``LlmSubstituteGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport, constrained to the ``GeneratedSubstitute`` schema, so the invented
movement arrives with its full enriched detail and can enter the catalog once, as
``ai_generated``, for everyone. Output crosses the boundary through
``parse_generated_substitute`` and raises ``GenerationError`` on anything
malformed."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from pydantic import ValidationError

from app.generation.generator import GenerationError
from app.generation.llm.port import StructuredLLM
from app.generation.schema import GeneratedSubstitute

MAX_TOKENS = 4000


@dataclass(frozen=True)
class SubstituteRequest:
    """A request to invent one substitute for an Exercise the user cannot perform.

    Carries the original movement's name, the user's goal (training type) and the
    equipment/constraints the substitute must respect, so the AI fallback honors
    the same filters lookup-first resolution applied."""

    original_name: str
    training_type: str | None = None
    available_equipment: tuple[str, ...] = ()
    constraints: tuple[str, ...] = ()


class SubstituteGenerator(Protocol):
    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        """Produce a schema-valid substitute Exercise for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def parse_generated_substitute(raw_json: str) -> GeneratedSubstitute:
    """Validate raw model output against the substitute schema at the boundary."""

    try:
        return GeneratedSubstitute.model_validate_json(raw_json)
    except ValidationError as exc:
        raise GenerationError(
            f"substitute generation did not match the schema: {exc}"
        ) from exc


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. A user cannot perform a "
        "prescribed exercise and no suitable catalog substitute exists, so invent "
        "one movement that achieves a similar training effect. Respect the user's "
        "available equipment and constraints absolutely — never prescribe a movement "
        "that needs equipment they lack or that their constraints rule out. Provide "
        "the exercise name, a short description, execution instructions, a 1–10 "
        "difficulty, targeted muscles, required equipment, and any precautions. "
        "Respond strictly in the required JSON schema."
    )


def _user_prompt(request: SubstituteRequest) -> str:
    equipment = (
        ", ".join(request.available_equipment)
        if request.available_equipment
        else "bodyweight only"
    )
    constraints = ", ".join(request.constraints) if request.constraints else "none"
    goal = request.training_type or "general fitness"
    return (
        f"Exercise to replace: {request.original_name}\n"
        f"Training goal: {goal}\n"
        f"Available equipment: {equipment}\n"
        f"Constraints to respect: {constraints}\n"
        "Invent one suitable substitute movement."
    )


class LlmSubstituteGenerator:
    """Invents a substitute Exercise via the ``StructuredLLM`` transport.

    The transport constrains output to ``GeneratedSubstitute``; this generator
    validates the raw text at its boundary, so a malformed substitute raises
    ``GenerationError`` and never enters the catalog (ADR-0006)."""

    def __init__(self, llm: StructuredLLM) -> None:
        self._llm = llm

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        text = self._llm.complete(
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedSubstitute,
            max_tokens=MAX_TOKENS,
        )
        return parse_generated_substitute(text)


__all__ = [
    "SubstituteRequest",
    "SubstituteGenerator",
    "LlmSubstituteGenerator",
    "parse_generated_substitute",
]
