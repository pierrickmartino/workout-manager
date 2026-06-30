"""Boundary validation of AI generation output.

ADR-0006: generation is schema-constrained, and a malformed or unparseable
generation must be handled — not silently passed downstream. ``parse_generated_session``
is the seam where the AI layer meets the domain: these tests pin that a well-formed
payload parses into the typed schema and that bad output raises ``GenerationError``."""

from __future__ import annotations

import pytest

from app.generation.generator import (
    GenerationError,
    GenerationRequest,
    LlmSessionGenerator,
    parse_generated_session,
)
from tests.fake_llm import FakeStructuredLLM

VALID_PAYLOAD = """
{
  "prescriptions": [
    {
      "exercise_name": "Back Squat",
      "exercise_description": "Compound lower-body lift.",
      "targeted_muscles": ["quads", "glutes"],
      "required_equipment": ["barbell"],
      "sets": 5,
      "reps": "5",
      "rest_seconds": 120,
      "tempo": "3-1-1",
      "recommended_load": "70% 1RM"
    }
  ]
}
"""


def test_parses_a_valid_generation_into_the_typed_schema():
    # Act
    generated = parse_generated_session(VALID_PAYLOAD)

    # Assert
    assert len(generated.prescriptions) == 1
    prescription = generated.prescriptions[0]
    assert prescription.exercise_name == "Back Squat"
    assert prescription.targeted_muscles == ["quads", "glutes"]
    assert prescription.sets == 5
    assert prescription.reps == "5"


def test_unparseable_json_raises_generation_error():
    # Act / Assert
    with pytest.raises(GenerationError):
        parse_generated_session("not json at all {{{")


def test_schema_violation_raises_generation_error():
    # Arrange — "sets" must be an integer; a missing required field also fails
    bad = '{"prescriptions": [{"exercise_name": "Squat", "sets": "lots", "reps": "5"}]}'

    # Act / Assert
    with pytest.raises(GenerationError):
        parse_generated_session(bad)


def test_empty_prescriptions_list_raises_generation_error():
    # Arrange — a session with no prescriptions is malformed: it would persist an
    # empty workout instead of failing generation.
    empty = '{"prescriptions": []}'

    # Act / Assert
    with pytest.raises(GenerationError):
        parse_generated_session(empty)


def test_missing_prescriptions_field_raises_generation_error():
    # Arrange — "{}" must not default to an empty, acceptable session.
    # Act / Assert
    with pytest.raises(GenerationError):
        parse_generated_session("{}")


def test_optional_prescription_fields_default_to_none():
    # Arrange — the model may omit rest/tempo/load
    minimal = '{"prescriptions": [{"exercise_name": "Plank", "sets": 3, "reps": "30s"}]}'

    # Act
    generated = parse_generated_session(minimal)

    # Assert
    prescription = generated.prescriptions[0]
    assert prescription.rest_seconds is None
    assert prescription.tempo is None
    assert prescription.recommended_load is None
    assert prescription.targeted_muscles == []


# --- LlmSessionGenerator wiring, exercised with a fake StructuredLLM port ---


REQUEST = GenerationRequest(
    training_type="strength", duration_minutes=45, equipment=["barbell"]
)


def test_generator_validates_transport_output():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    generator = LlmSessionGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — parsed result plus the schema-constrained transport request
    assert generated.prescriptions[0].exercise_name == "Back Squat"
    from app.generation.schema import GeneratedSession

    call = llm.calls[0]
    assert call["schema"] is GeneratedSession
    assert call["max_tokens"] == 8000


def test_generator_wraps_malformed_output_as_generation_error():
    # Arrange — the transport returned something that isn't valid JSON
    generator = LlmSessionGenerator(FakeStructuredLLM(text="oops not json"))

    # Act / Assert
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_generator_propagates_transport_failures_as_generation_error():
    # Arrange — the transport itself raised (network / API failure already wrapped)
    generator = LlmSessionGenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
