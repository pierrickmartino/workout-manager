"""The muscle-granularity re-enrichment path through the LLM transport (issue #545).

This generator is the granularity re-enrichment pass's port: given an Exercise and its
coarse, group-level ``targeted_muscles`` union, it asks the model to restate the same
training at individual-muscle resolution — "back" refined into "latissimus dorsi",
"trapezius", "rhomboids". Only the flat union is returned; the Primary/Secondary split
(ADR-0016) is untouched. Output is schema-constrained to ``GeneratedMuscleGranularity``
and validated at the boundary; malformed output raises ``GenerationError`` and nothing
is written."""

from __future__ import annotations

import pytest

from app.generation.llm.port import GenerationError
from app.generation.monitoring.call import GeneratorKind
from app.generation.muscle_granularity_generator import (
    LlmMuscleGranularityGenerator,
    MuscleGranularityRequest,
)
from app.generation.schema import GeneratedMuscleGranularity
from tests.fake_llm import FakeStructuredLLM

VALID_PAYLOAD = """
{"targeted_muscles": ["latissimus dorsi", "trapezius", "rhomboids"]}
"""

REQUEST = MuscleGranularityRequest(
    exercise_name="Pull-Up",
    description="A vertical pull.",
    targeted_muscles=("back", "biceps"),
)


def test_generator_validates_transport_output_into_a_finer_union():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmMuscleGranularityGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — the finer union crosses the parse_* boundary, constrained to the schema
    assert generated.targeted_muscles == ["latissimus dorsi", "trapezius", "rhomboids"]
    assert llm.calls[0]["schema"] is GeneratedMuscleGranularity


def test_prompt_carries_the_name_and_the_coarse_muscles():
    # Arrange — the model refines the Exercise's own name and existing coarse union
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmMuscleGranularityGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert
    user = llm.calls[0]["user"]
    assert "Pull-Up" in user
    assert "back" in user and "biceps" in user
    system = llm.calls[0]["system"]
    assert "finer granularity" in system
    assert "never add a muscle in a region the exercise does not already train" in system


def test_tags_calls_under_exercise_enrichment_by_default():
    # Arrange — the human-triggered granularity batch's spend must read as its own line
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmMuscleGranularityGenerator(llm)

    # Act
    generator.generate(REQUEST)

    # Assert
    context = llm.calls[0]["context"]
    assert context.generator_kind is GeneratorKind.EXERCISE_ENRICHMENT


def test_wraps_malformed_output_as_generation_error():
    generator = LlmMuscleGranularityGenerator(FakeStructuredLLM(text="not json"))
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_propagates_transport_failures():
    generator = LlmMuscleGranularityGenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
