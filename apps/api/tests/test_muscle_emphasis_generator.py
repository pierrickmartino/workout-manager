"""The muscle-emphasis enrichment path through the LLM transport (issue #107, ADR-0016).

This generator is the re-enrichment pass's port: given an existing catalog Exercise's
name and its flat ``targeted_muscles`` union, it asks the model to *classify* those
same muscles into a Primary/Secondary split — never inventing muscles outside the
union, so ``targeted_muscles`` stays the durable analytics-facing field untouched.
Output is schema-constrained to ``GeneratedMuscleEmphasis`` and validated at the
boundary; malformed output raises ``GenerationError`` and no split is written."""

from __future__ import annotations

import pytest

from app.generation.llm.port import GenerationError
from app.generation.muscle_emphasis_generator import (
    LlmMuscleEmphasisGenerator,
    MuscleEmphasisRequest,
)
from app.generation.schema import GeneratedMuscleEmphasis
from tests.fake_llm import FakeStructuredLLM

VALID_PAYLOAD = """
{
  "primary_muscles": ["quads"],
  "secondary_muscles": ["glutes", "hamstrings"]
}
"""

REQUEST = MuscleEmphasisRequest(
    exercise_name="Bulgarian Split Squat",
    description="A single-leg squat with the rear foot elevated.",
    targeted_muscles=("quads", "glutes", "hamstrings"),
)


def test_generator_validates_transport_output_into_a_split():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmMuscleEmphasisGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — the parsed split plus the schema-constrained transport request
    assert generated.primary_muscles == ["quads"]
    assert generated.secondary_muscles == ["glutes", "hamstrings"]
    call = llm.calls[0]
    assert call["schema"] is GeneratedMuscleEmphasis


def test_prompt_carries_the_exercise_name_and_its_existing_muscles():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmMuscleEmphasisGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert — the movement and the exact muscles to classify reach the model, so
    # it splits the existing union rather than inventing a new muscle list.
    prompt = llm.calls[0]["user"]
    assert "Bulgarian Split Squat" in prompt
    assert "quads" in prompt
    assert "glutes" in prompt
    assert "hamstrings" in prompt


def test_wraps_malformed_output_as_generation_error():
    generator = LlmMuscleEmphasisGenerator(FakeStructuredLLM(text="not json"))
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_propagates_transport_failures():
    generator = LlmMuscleEmphasisGenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
