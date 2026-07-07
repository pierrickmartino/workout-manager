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
  "instructions": [
    "Set your back flat against a wall.",
    "Slide down until your thighs are parallel to the floor.",
    "Hold the position."
  ],
  "difficulty": 2,
  "targeted_muscles": ["quads", "glutes"],
  "primary_muscles": ["quads"],
  "secondary_muscles": ["glutes"],
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
    # Execution Steps arrive as an ordered list, not a prose blob (ADR-0015)
    assert generated.instructions == [
        "Set your back flat against a wall.",
        "Slide down until your thighs are parallel to the floor.",
        "Hold the position.",
    ]
    assert generated.difficulty == 2
    # The Primary/Secondary emphasis split (ADR-0016) rides alongside the flat
    # targeted-muscle union, which stays the durable analytics-facing field.
    assert generated.targeted_muscles == ["quads", "glutes"]
    assert generated.primary_muscles == ["quads"]
    assert generated.secondary_muscles == ["glutes"]
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


def test_substitute_system_prompt_asks_for_ordered_execution_steps():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmSubstituteGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert — the model is told to emit ordered steps, not a prose blob (ADR-0015)
    system = llm.calls[0]["system"].lower()
    assert "step" in system


def test_substitute_system_prompt_asks_for_a_primary_secondary_split():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmSubstituteGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert — the model is asked to split muscle emphasis into primary/secondary
    # (ADR-0016) so newly invented movements enter the catalog with a real split.
    system = llm.calls[0]["system"].lower()
    assert "primary" in system
    assert "secondary" in system


def test_substitute_split_defaults_empty_when_the_model_omits_it():
    # Arrange — an older-shaped payload with no primary/secondary split at all
    payload = """
    {
      "exercise_name": "Wall Sit",
      "targeted_muscles": ["quads"],
      "required_equipment": []
    }
    """
    generator = LlmSubstituteGenerator(FakeStructuredLLM(text=payload))

    # Act
    generated = generator.generate(REQUEST)

    # Assert — no fabricated primacy: the split is empty, the union survives
    assert generated.primary_muscles == []
    assert generated.secondary_muscles == []
    assert generated.targeted_muscles == ["quads"]


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
