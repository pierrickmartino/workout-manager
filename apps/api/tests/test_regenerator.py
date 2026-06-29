"""Session Regeneration through Claude (ADR-0006).

Regeneration replaces the *non-kept* Exercise Prescriptions of one Session,
conditioned on the kept Prescriptions and the negative-feedback reason so
progression stays coherent (CONTEXT.md). The AI's output is the set of
replacement prescriptions, schema-constrained to ``GeneratedSession`` and
validated at the boundary — a malformed regeneration raises ``GenerationError``,
never reaching the user's copy. These tests pin the wiring and that the kept
context and reason actually steer the request."""

from __future__ import annotations

import pytest

from app.generation.generator import GenerationError
from app.generation.regenerator import (
    GENERATION_MODEL,
    AnthropicSessionRegenerator,
    KeptPrescription,
    RegenerationRequest,
)

VALID_PAYLOAD = """
{
  "prescriptions": [
    {
      "exercise_name": "Goblet Squat",
      "exercise_description": "Knee-friendly squat variation.",
      "targeted_muscles": ["quads", "glutes"],
      "required_equipment": ["dumbbell"],
      "sets": 3,
      "reps": "10",
      "rest_seconds": 90,
      "tempo": "2-0-2",
      "recommended_load": "moderate"
    }
  ]
}
"""

REQUEST = RegenerationRequest(
    training_type="strength",
    duration_minutes=45,
    kept=[
        KeptPrescription(
            exercise_name="Back Squat",
            sets=5,
            reps="5",
            recommended_load="70% 1RM",
        )
    ],
    reason="my knees hurt on deep squats",
)


# --- Fake Anthropic client, mirroring the generator tests ---------------------


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


def test_regenerator_validates_streamed_replacements():
    # Arrange
    client = _FakeClient(text=VALID_PAYLOAD)
    regenerator = AnthropicSessionRegenerator(client)

    # Act
    generated = regenerator.regenerate(REQUEST)

    # Assert — parsed replacements plus the ADR-0006 request config
    assert generated.prescriptions[0].exercise_name == "Goblet Squat"
    call = client.messages.calls[0]
    assert call["model"] == GENERATION_MODEL
    assert call["thinking"] == {"type": "adaptive"}
    assert call["output_format"] is not None


def test_regeneration_prompt_carries_kept_context_and_reason():
    # Arrange
    client = _FakeClient(text=VALID_PAYLOAD)
    regenerator = AnthropicSessionRegenerator(client)

    # Act
    regenerator.regenerate(REQUEST)

    # Assert — the AI is told what to keep and why to change the rest
    prompt = client.messages.calls[0]["messages"][0]["content"]
    assert "Back Squat" in prompt
    assert "my knees hurt on deep squats" in prompt


def test_regeneration_prompt_handles_keeping_nothing():
    # Arrange — keep nothing: the AI is asked to replace the whole Session
    client = _FakeClient(text=VALID_PAYLOAD)
    regenerator = AnthropicSessionRegenerator(client)
    request = RegenerationRequest(
        training_type="strength",
        duration_minutes=45,
        kept=[],
        reason=None,
    )

    # Act
    regenerator.regenerate(request)

    # Assert — the prompt still forms, signalling a full replacement
    prompt = client.messages.calls[0]["messages"][0]["content"]
    assert "none" in prompt.lower()


def test_regenerator_wraps_malformed_output_as_generation_error():
    # Arrange — the model streamed back something that isn't valid JSON
    regenerator = AnthropicSessionRegenerator(_FakeClient(text="not json"))

    # Act / Assert
    with pytest.raises(GenerationError):
        regenerator.regenerate(REQUEST)


def test_regenerator_wraps_api_failures_as_generation_error():
    # Arrange — the API call itself blows up
    regenerator = AnthropicSessionRegenerator(
        _FakeClient(error=RuntimeError("connection reset"))
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        regenerator.regenerate(REQUEST)
