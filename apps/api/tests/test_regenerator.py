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
    KeptPrescription,
    LlmSessionRegenerator,
    RegenerationRequest,
)
from tests.fake_llm import FakeStructuredLLM

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


# --- LlmSessionRegenerator wiring, exercised with a fake StructuredLLM port ----


def test_regenerator_validates_transport_replacements():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    regenerator = LlmSessionRegenerator(llm)

    # Act
    generated = regenerator.regenerate(REQUEST)

    # Assert — parsed replacements plus the schema-constrained transport request
    assert generated.prescriptions[0].exercise_name == "Goblet Squat"
    from app.generation.schema import GeneratedSession

    call = llm.calls[0]
    assert call["schema"] is GeneratedSession
    assert call["max_tokens"] == 8000


def test_regeneration_prompt_carries_kept_context_and_reason():
    # Arrange
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    regenerator = LlmSessionRegenerator(llm)

    # Act
    regenerator.regenerate(REQUEST)

    # Assert — the AI is told what to keep and why to change the rest
    prompt = llm.calls[0]["user"]
    assert "Back Squat" in prompt
    assert "my knees hurt on deep squats" in prompt


def test_regeneration_prompt_handles_keeping_nothing():
    # Arrange — keep nothing: the AI is asked to replace the whole Session
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    regenerator = LlmSessionRegenerator(llm)
    request = RegenerationRequest(
        training_type="strength",
        duration_minutes=45,
        kept=[],
        reason=None,
    )

    # Act
    regenerator.regenerate(request)

    # Assert — the prompt still forms, signalling a full replacement
    prompt = llm.calls[0]["user"]
    assert "none" in prompt.lower()


def test_regenerator_wraps_malformed_output_as_generation_error():
    # Arrange — the transport returned something that isn't valid JSON
    regenerator = LlmSessionRegenerator(FakeStructuredLLM(text="not json"))

    # Act / Assert
    with pytest.raises(GenerationError):
        regenerator.regenerate(REQUEST)


def test_regenerator_propagates_transport_failures_as_generation_error():
    # Arrange — the transport itself raised (already-wrapped network / API failure)
    regenerator = LlmSessionRegenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        regenerator.regenerate(REQUEST)
