"""The muscle-emphasis enrichment path (issue #107, ADR-0016).

``MuscleEmphasisGenerator`` is the port the re-enrichment pass depends on: given an
existing catalog Exercise's name and its flat ``targeted_muscles`` union, it returns
a Primary/Secondary split of *those same muscles*. The concrete
``LlmMuscleEmphasisGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport constrained to ``GeneratedMuscleEmphasis``; output crosses the shared
``generate_structured`` boundary and raises ``GenerationError`` on anything
malformed, so a bad split is never written to the catalog.

The pass classifies the *existing* union rather than inventing muscles, so
``targeted_muscles`` — the durable analytics-facing field the F3 roll-up reads — is
left untouched (ADR-0016)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.generation.llm.port import StructuredLLM
from app.generation.monitoring.call import GenerationCallContext, GeneratorKind
from app.generation.schema import GeneratedMuscleEmphasis
from app.generation.structured import generate_structured

MAX_TOKENS = 1000


@dataclass(frozen=True)
class MuscleEmphasisRequest:
    """A request to split one existing Exercise's muscles into Primary/Secondary.

    Carries the movement's name and its flat ``targeted_muscles`` union so the model
    classifies the muscles the Exercise already claims, never inventing new ones. The
    optional ``description`` gives the model context to judge which muscles lead."""

    exercise_name: str
    description: str | None = None
    targeted_muscles: tuple[str, ...] = field(default_factory=tuple)


class MuscleEmphasisGenerator(Protocol):
    def generate(self, request: MuscleEmphasisRequest) -> GeneratedMuscleEmphasis:
        """Produce a schema-valid Primary/Secondary split for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. You are given one exercise and "
        "the full list of muscles it works. Split that emphasis into primary_muscles "
        "(the prime movers the exercise is chosen to train) and secondary_muscles "
        "(the muscles that assist). Classify only the muscles you are given — never "
        "add a muscle that is not in the provided list, and account for every muscle "
        "by placing it in exactly one of the two groups. Respond strictly in the "
        "required JSON schema."
    )


def _user_prompt(request: MuscleEmphasisRequest) -> str:
    muscles = (
        ", ".join(request.targeted_muscles) if request.targeted_muscles else "none"
    )
    description = request.description or "(no description)"
    return (
        f"Exercise: {request.exercise_name}\n"
        f"Description: {description}\n"
        f"Muscles worked: {muscles}\n"
        "Split these muscles into primary and secondary emphasis."
    )


class LlmMuscleEmphasisGenerator:
    """Splits an Exercise's muscles via the ``StructuredLLM`` transport.

    The transport constrains output to ``GeneratedMuscleEmphasis``; this generator
    validates the raw text at its boundary, so a malformed split raises
    ``GenerationError`` and is never written to the catalog."""

    def __init__(
        self,
        llm: StructuredLLM,
        *,
        kind: GeneratorKind = GeneratorKind.MUSCLE_EMPHASIS,
    ) -> None:
        # ``kind`` is caller-supplied: the same generator serves the live catalog split
        # (``MUSCLE_EMPHASIS``, the default) and the human-triggered re-enrichment batch
        # (``EXERCISE_ENRICHMENT``), which the operator must see as distinct spend.
        self._llm = llm
        self._kind = kind

    def generate(self, request: MuscleEmphasisRequest) -> GeneratedMuscleEmphasis:
        return generate_structured(
            llm=self._llm,
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedMuscleEmphasis,
            max_tokens=MAX_TOKENS,
            subject="muscle emphasis generation",
            context=GenerationCallContext(generator_kind=self._kind),
        )


__all__ = [
    "MuscleEmphasisRequest",
    "MuscleEmphasisGenerator",
    "LlmMuscleEmphasisGenerator",
]
