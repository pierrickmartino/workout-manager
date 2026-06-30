"""AI fallback for Substitution through Claude (ADR-0006).

The substitute generator is called only when no catalog Variation/Alternative
fits. Its output is one invented movement with full enriched detail, schema-
constrained to ``GeneratedSubstitute`` and validated at the boundary — malformed
output raises ``GenerationError`` and never enters the catalog. These tests pin
the wiring and that the user's equipment and constraints steer the request,
mirroring the generator/regenerator tests' fake transport port."""

from __future__ import annotations

import pytest

from app.generation.generator import GenerationError
from app.generation.substitute_generator import (
    LlmSubstituteGenerator,
    SubstituteRequest,
)
from tests.fake_llm import FakeStructuredLLM

VALID_PAYLOAD = """
{
  "exercise_name": "Wall Sit",
  "exercise_description": "An isometric quad hold against a wall.",
  "instructions": "Slide down a wall until your thighs are parallel.",
  "difficulty": 2,
  "targeted_muscles": ["quads"],
  "required_equipment": [],
  "precautions": ["stop if you feel knee pain"]
}
"""

REQUEST = SubstituteRequest(
    original_name="Barbell Back Squat",
    training_type="strength",
    available_equipment=("dumbbell",),
    constraints=("no jumping",),
)


def test_substitute_generator_validates_transport_output():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmSubstituteGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — parsed substitute plus the schema-constrained transport request
    assert generated.exercise_name == "Wall Sit"
    assert generated.difficulty == 2
    from app.generation.schema import GeneratedSubstitute

    call = llm.calls[0]
    assert call["schema"] is GeneratedSubstitute
    assert call["max_tokens"] == 4000


def test_substitute_prompt_carries_equipment_and_constraints():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmSubstituteGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert — the movement to replace, the equipment, and the constraint all reach
    # the model so the fallback honors the same filters as lookup-first resolution
    prompt = llm.calls[0]["user"]
    assert "Barbell Back Squat" in prompt
    assert "dumbbell" in prompt
    assert "no jumping" in prompt


def test_substitute_generator_wraps_malformed_output_as_generation_error():
    generator = LlmSubstituteGenerator(FakeStructuredLLM(text="not json"))
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_substitute_generator_propagates_transport_failures():
    generator = LlmSubstituteGenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
