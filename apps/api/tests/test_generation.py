"""Boundary validation of AI generation output.

ADR-0006: generation is schema-constrained, and a malformed or unparseable
generation must be handled — not silently passed downstream. ``parse_generated_session``
is the seam where the AI layer meets the domain: these tests pin that a well-formed
payload parses into the typed schema and that bad output raises ``GenerationError``."""

from __future__ import annotations

import pytest

from app.generation.generator import (
    GENERATION_MODEL,
    AnthropicSessionGenerator,
    GenerationError,
    GenerationRequest,
    parse_generated_session,
)

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


# --- AnthropicSessionGenerator wiring, exercised with a fake Anthropic client ---


class _TextBlock:
    type = "text"

    def __init__(self, text: str) -> None:
        self.text = text


class _FinalMessage:
    def __init__(self, text: str) -> None:
        self.content = [_TextBlock(text)]


class _StreamCtx:
    def __init__(self, text: str) -> None:
        self._text = text

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self) -> _FinalMessage:
        return _FinalMessage(self._text)


class _Messages:
    def __init__(self, *, text: str | None = None, error: Exception | None = None):
        self._text = text
        self._error = error
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        return _StreamCtx(self._text)


class _FakeClient:
    def __init__(self, *, text: str | None = None, error: Exception | None = None):
        self.messages = _Messages(text=text, error=error)


REQUEST = GenerationRequest(
    training_type="strength", duration_minutes=45, equipment=["barbell"]
)


def test_anthropic_generator_validates_streamed_output():
    # Arrange
    client = _FakeClient(text=VALID_PAYLOAD)
    generator = AnthropicSessionGenerator(client)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — parsed result plus the ADR-0006 request config
    assert generated.prescriptions[0].exercise_name == "Back Squat"
    call = client.messages.calls[0]
    assert call["model"] == GENERATION_MODEL
    assert call["thinking"] == {"type": "adaptive"}
    assert call["output_format"] is not None


def test_anthropic_generator_wraps_malformed_output_as_generation_error():
    # Arrange — the model streamed back something that isn't valid JSON
    generator = AnthropicSessionGenerator(_FakeClient(text="oops not json"))

    # Act / Assert
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_anthropic_generator_wraps_api_failures_as_generation_error():
    # Arrange — the API call itself blows up
    generator = AnthropicSessionGenerator(
        _FakeClient(error=RuntimeError("connection reset"))
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
