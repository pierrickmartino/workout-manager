"""The exercise-enrichment path through the LLM transport (issue #308, ADR-0041).

This generator is the Stub-enrichment backfill's port: given a name-only catalog
Exercise, it asks the model to supply the fields that lift a Stub to at least
**Listable** — a description, the flat ``targeted_muscles`` union, ordered Execution
Steps, and a 1–10 difficulty. It deliberately produces **no precautions, no image,
and no Primary/Secondary split** (those are curator-only / Enriched-tier). Output is
schema-constrained to ``GeneratedEnrichment`` and validated at the boundary;
malformed output raises ``GenerationError`` and nothing is written."""

from __future__ import annotations

import pytest

from app.generation.exercise_enrichment_generator import (
    EnrichmentRequest,
    LlmExerciseEnrichmentGenerator,
)
from app.generation.llm.port import GenerationError
from app.generation.monitoring.call import GeneratorKind
from app.generation.schema import GeneratedEnrichment
from tests.fake_llm import FakeStructuredLLM

VALID_PAYLOAD = """
{
  "description": "A single-leg squat with the rear foot elevated.",
  "targeted_muscles": ["quads", "glutes", "hamstrings"],
  "instructions": ["Elevate the rear foot.", "Descend into the front leg.", "Drive up."],
  "difficulty": 4
}
"""

REQUEST = EnrichmentRequest(exercise_name="Bulgarian Split Squat")


def test_generator_validates_transport_output_into_an_enrichment():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmExerciseEnrichmentGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — the parsed enrichment plus the schema-constrained transport request
    assert generated.description == "A single-leg squat with the rear foot elevated."
    assert generated.targeted_muscles == ["quads", "glutes", "hamstrings"]
    assert generated.instructions == [
        "Elevate the rear foot.",
        "Descend into the front leg.",
        "Drive up.",
    ]
    assert generated.difficulty == 4
    call = llm.calls[0]
    assert call["schema"] is GeneratedEnrichment


def test_prompt_carries_the_exercise_name():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmExerciseEnrichmentGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert — the movement to enrich reaches the model
    prompt = llm.calls[0]["user"]
    assert "Bulgarian Split Squat" in prompt


def test_tags_calls_under_exercise_enrichment_by_default():
    # Arrange — the backfill's spend must read as its own monitoring line
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmExerciseEnrichmentGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert
    context = llm.calls[0]["context"]
    assert context.generator_kind is GeneratorKind.EXERCISE_ENRICHMENT


def test_wraps_malformed_output_as_generation_error():
    generator = LlmExerciseEnrichmentGenerator(FakeStructuredLLM(text="not json"))
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_propagates_transport_failures():
    generator = LlmExerciseEnrichmentGenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
