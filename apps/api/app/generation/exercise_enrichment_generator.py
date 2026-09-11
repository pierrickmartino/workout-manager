"""The exercise-enrichment path (issue #308, ADR-0041).

``ExerciseEnrichmentGenerator`` is the port the Stub-enrichment backfill depends on:
given a name-only catalog Exercise, it returns the fields that lift a Stub to at
least **Listable** — a description, the flat ``targeted_muscles`` union, ordered
Execution Steps, and a 1–10 difficulty. The concrete
``LlmExerciseEnrichmentGenerator`` runs through the provider-agnostic
``StructuredLLM`` transport constrained to ``GeneratedEnrichment``; output crosses
the shared ``generate_structured`` boundary and raises ``GenerationError`` on
anything malformed, so a bad enrichment is never written to the catalog.

By construction the generator produces **no precautions and no image** — a
fabricated safety note or a wrong illustration is actively dangerous in an
injury/rehab-cautious domain, so both stay curator-only — and **no
Primary/Secondary split**, which is Enriched-tier only (ADR-0016/0041). The schema
carries no field for any of them, so the model is never even asked."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.generation.llm.port import StructuredLLM
from app.generation.monitoring.call import GenerationCallContext, GeneratorKind
from app.generation.schema import GeneratedEnrichment
from app.generation.structured import generate_structured

MAX_TOKENS = 2000


@dataclass(frozen=True)
class EnrichmentRequest:
    """A request to fill one Stub Exercise up to the Listable bar.

    A Stub is a name-only movement (ADR-0041), so the name is the only input the
    model works from. The optional ``description`` gives context on the rare Stub
    that already carries some prose but is missing muscles or steps."""

    exercise_name: str
    description: str | None = None


class ExerciseEnrichmentGenerator(Protocol):
    def generate(self, request: EnrichmentRequest) -> GeneratedEnrichment:
        """Produce a schema-valid enrichment for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. You are given the name of one "
        "exercise and must supply its baseline catalog detail: a short description, "
        "the full set of muscles it works in targeted_muscles, execution "
        "instructions as an ordered list of discrete steps (one action per step, in "
        "performance order), and a 1–10 difficulty. Do NOT provide safety "
        "precautions and do NOT provide an image — those are added only by a human "
        "reviewer. If the name is too vague to describe a real movement honestly, "
        "return empty fields rather than inventing detail. Respond strictly in the "
        "required JSON schema."
    )


def _user_prompt(request: EnrichmentRequest) -> str:
    description = request.description or "(none)"
    return (
        f"Exercise: {request.exercise_name}\n"
        f"Existing description: {description}\n"
        "Supply the baseline catalog detail for this movement."
    )


class LlmExerciseEnrichmentGenerator:
    """Fills a Stub Exercise via the ``StructuredLLM`` transport.

    The transport constrains output to ``GeneratedEnrichment``; this generator
    validates the raw text at its boundary, so a malformed enrichment raises
    ``GenerationError`` and is never written to the catalog (ADR-0006)."""

    def __init__(
        self,
        llm: StructuredLLM,
        *,
        kind: GeneratorKind = GeneratorKind.EXERCISE_ENRICHMENT,
    ) -> None:
        # ``kind`` defaults to ``EXERCISE_ENRICHMENT`` so the human-triggered backfill's
        # spend reads as its own line; it stays caller-supplied for symmetry with the
        # other generators.
        self._llm = llm
        self._kind = kind

    def generate(self, request: EnrichmentRequest) -> GeneratedEnrichment:
        return generate_structured(
            llm=self._llm,
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedEnrichment,
            max_tokens=MAX_TOKENS,
            subject="exercise enrichment generation",
            context=GenerationCallContext(generator_kind=self._kind),
        )


__all__ = [
    "EnrichmentRequest",
    "ExerciseEnrichmentGenerator",
    "LlmExerciseEnrichmentGenerator",
]
