"""AI fallback for Substitution through Claude (ADR-0006).

The substitute generator is called only when no catalog Variation/Alternative
fits. Its output is one invented movement with full enriched detail, schema-
constrained to ``GeneratedSubstitute`` and validated at the boundary — malformed
output raises ``GenerationError`` and never enters the catalog. These tests pin
the wiring and that the user's equipment and constraints steer the request,
mirroring the generator/regenerator tests' fake Anthropic client."""

from __future__ import annotations

import pytest

from app.generation.generator import GENERATION_MODEL, GenerationError
from app.generation.substitute_generator import (
    AnthropicSubstituteGenerator,
    SubstituteRequest,
)

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


def test_substitute_generator_validates_streamed_output():
    # Arrange
    client = _FakeClient(text=VALID_PAYLOAD)
    generator = AnthropicSubstituteGenerator(client)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — parsed substitute plus the ADR-0006 request config
    assert generated.exercise_name == "Wall Sit"
    assert generated.difficulty == 2
    call = client.messages.calls[0]
    assert call["model"] == GENERATION_MODEL
    assert call["thinking"] == {"type": "adaptive"}
    assert call["output_format"] is not None


def test_substitute_prompt_carries_equipment_and_constraints():
    # Arrange
    client = _FakeClient(text=VALID_PAYLOAD)
    generator = AnthropicSubstituteGenerator(client)

    # Act
    generator.generate(REQUEST)

    # Assert — the movement to replace, the equipment, and the constraint all reach
    # the model so the fallback honors the same filters as lookup-first resolution
    prompt = client.messages.calls[0]["messages"][0]["content"]
    assert "Barbell Back Squat" in prompt
    assert "dumbbell" in prompt
    assert "no jumping" in prompt


def test_substitute_generator_wraps_malformed_output_as_generation_error():
    generator = AnthropicSubstituteGenerator(_FakeClient(text="not json"))
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_substitute_generator_wraps_api_failures_as_generation_error():
    generator = AnthropicSubstituteGenerator(
        _FakeClient(error=RuntimeError("connection reset"))
    )
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
