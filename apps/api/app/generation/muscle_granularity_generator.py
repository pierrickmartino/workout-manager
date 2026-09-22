"""The muscle-granularity re-enrichment path (issue #545, ADR-0016/0078).

``MuscleGranularityGenerator`` is the port the granularity re-enrichment pass depends
on: given an existing catalog Exercise's name and its coarse ``targeted_muscles``
union, it returns that *same* training restated at **individual-muscle** resolution —
"back" refined into "latissimus dorsi", "trapezius", "rhomboids". The concrete
``LlmMuscleGranularityGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport constrained to ``GeneratedMuscleGranularity``; output crosses the shared
``generate_structured`` boundary and raises ``GenerationError`` on anything malformed,
so a bad union is never written to the catalog.

The pass *refines the union in place* — it does not invent a movement or touch the
Primary/Secondary split (ADR-0016). It is honest by construction: the model is told to
name only muscles the exercise already works and to keep the same body regions, and the
re-enrichment pass's write boundary independently discards any refinement that would
change the six-group roll-up (issue #545), so a finer union can never fabricate or lose
a Muscle Group."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.generation.llm.port import StructuredLLM
from app.generation.monitoring.call import GenerationCallContext, GeneratorKind
from app.generation.schema import GeneratedMuscleGranularity
from app.generation.structured import generate_structured

MAX_TOKENS = 1000


@dataclass(frozen=True)
class MuscleGranularityRequest:
    """A request to restate one existing Exercise's muscles at finer granularity.

    Carries the movement's name and its current coarse ``targeted_muscles`` union so the
    model refines the muscles the Exercise already claims, never inventing new training.
    The optional ``description`` gives the model context to pick the right specific
    muscles."""

    exercise_name: str
    description: str | None = None
    targeted_muscles: tuple[str, ...] = field(default_factory=tuple)


class MuscleGranularityGenerator(Protocol):
    def generate(
        self, request: MuscleGranularityRequest
    ) -> GeneratedMuscleGranularity:
        """Produce a schema-valid finer-grained union for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. You are given one exercise and the "
        "current list of muscles it works, which is written at a coarse, group level "
        "(words like 'back', 'shoulders', 'core'). Restate that SAME training at finer "
        "granularity: name the specific individual muscles worked using standard "
        "anatomical names — for example 'latissimus dorsi', 'trapezius', and 'rhomboids' "
        "instead of 'back'. Refine only the muscles you are given: cover the same body "
        "regions and never add a muscle in a region the exercise does not already train. "
        "Return the full refined set in targeted_muscles. Respond strictly in the "
        "required JSON schema."
    )


def _user_prompt(request: MuscleGranularityRequest) -> str:
    muscles = (
        ", ".join(request.targeted_muscles) if request.targeted_muscles else "none"
    )
    description = request.description or "(no description)"
    return (
        f"Exercise: {request.exercise_name}\n"
        f"Description: {description}\n"
        f"Current muscles: {muscles}\n"
        "Restate these muscles at finer, individual-muscle granularity."
    )


class LlmMuscleGranularityGenerator:
    """Refines an Exercise's muscle union via the ``StructuredLLM`` transport.

    The transport constrains output to ``GeneratedMuscleGranularity``; this generator
    validates the raw text at its boundary, so a malformed union raises
    ``GenerationError`` and is never written to the catalog (ADR-0006)."""

    def __init__(
        self,
        llm: StructuredLLM,
        *,
        kind: GeneratorKind = GeneratorKind.EXERCISE_ENRICHMENT,
    ) -> None:
        # ``kind`` defaults to ``EXERCISE_ENRICHMENT`` so the human-triggered granularity batch's
        # spend reads as its own monitoring line, mirroring the muscle-emphasis re-enrichment.
        self._llm = llm
        self._kind = kind

    def generate(
        self, request: MuscleGranularityRequest
    ) -> GeneratedMuscleGranularity:
        return generate_structured(
            llm=self._llm,
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedMuscleGranularity,
            max_tokens=MAX_TOKENS,
            subject="muscle granularity generation",
            context=GenerationCallContext(generator_kind=self._kind),
        )


__all__ = [
    "MuscleGranularityRequest",
    "MuscleGranularityGenerator",
    "LlmMuscleGranularityGenerator",
]
