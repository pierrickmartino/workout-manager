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


def test_generator_stamps_the_call_trace_id_on_the_artifact():
    # Arrange — the recording decorator hands the generation call a trace-id handle
    llm = FakeStructuredLLM(text=VALID_PAYLOAD, trace_id="trace-sess")
    generator = LlmSessionGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — the Generated Session carries its originating call's trace id (#274)
    assert generated.trace_id == "trace-sess"


def test_generator_tags_the_transport_call_with_its_generator_kind():
    # The context ripples from the generator to the transport so the recording
    # decorator can attribute the call — the Session generator tags it "session".
    from app.generation.monitoring.call import GeneratorKind

    llm = FakeStructuredLLM(text=VALID_PAYLOAD)

    LlmSessionGenerator(llm).generate(REQUEST)

    context = llm.calls[0]["context"]
    assert context.generator_kind == GeneratorKind.SESSION
    assert context.clerk_user_id is None  # unattributed for this spine


def test_generator_kind_is_caller_overridable():
    # The same generator can be tagged for a different caller (mirrors the
    # muscle-emphasis live-vs-enrichment split) without touching generate().
    from app.generation.monitoring.call import GeneratorKind

    llm = FakeStructuredLLM(text=VALID_PAYLOAD)

    LlmSessionGenerator(llm, kind=GeneratorKind.PROTOCOL).generate(REQUEST)

    assert llm.calls[0]["context"].generator_kind == GeneratorKind.PROTOCOL


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


def test_generator_keeps_a_valid_generated_superset():
    # Arrange — the transport returns a valid Superset
    generator = LlmSessionGenerator(FakeStructuredLLM(text=_superset_payload()))

    # Act
    generated = generator.generate(REQUEST)

    # Assert — grouping survives through the generator's parse boundary
    assert [p.superset_group for p in generated.prescriptions] == ["ss1", "ss1"]


def test_generator_degrades_a_malformed_generated_superset_to_flat():
    # Arrange — the transport returns an uneven (invalid) Superset
    generator = LlmSessionGenerator(
        FakeStructuredLLM(text=_superset_payload(sets_a=3, sets_b=5))
    )

    # Act — the generation still succeeds, ungrouped
    generated = generator.generate(REQUEST)

    # Assert
    assert len(generated.prescriptions) == 2
    assert all(p.superset_group is None for p in generated.prescriptions)


def test_system_prompt_instructs_the_model_to_use_supersets():
    # Arrange / Act — the transport records the exact prompts it was asked to run
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    LlmSessionGenerator(llm).generate(REQUEST)

    # Assert — the model is told to prescribe Supersets where appropriate
    assert "superset" in llm.calls[0]["system"].lower()


SENSITIVE_REQUEST = GenerationRequest(
    training_type="strength",
    duration_minutes=45,
    equipment=["barbell"],
    has_sensitive_constraint=True,
)


def test_sensitive_request_degrades_even_a_valid_generated_superset_to_flat():
    # Arrange — a *valid* Superset from the model, but the request is Sensitive-
    # Constraint: it must never reach the user (ADR-0023).
    generator = LlmSessionGenerator(FakeStructuredLLM(text=_superset_payload()))

    # Act — the generation still succeeds, ungrouped
    generated = generator.generate(SENSITIVE_REQUEST)

    # Assert — a flat plan, both Prescriptions kept
    assert len(generated.prescriptions) == 2
    assert all(p.superset_group is None for p in generated.prescriptions)
    assert all(p.round_rest_seconds is None for p in generated.prescriptions)


def test_sensitive_request_prompt_instructs_the_model_to_emit_no_supersets():
    # Arrange / Act
    llm = FakeStructuredLLM(text=VALID_PAYLOAD)
    LlmSessionGenerator(llm).generate(SENSITIVE_REQUEST)

    # Assert — the model is told *not* to prescribe Supersets for this user
    system = llm.calls[0]["system"].lower()
    assert "no superset" in system or "do not" in system


# --- Generated Supersets: schema, parse-boundary validation, degrade-to-flat ---
# ADR-0023: the generator may prescribe a Superset (a group tag + round-rest per
# prescription). A valid group survives the parse boundary; a malformed one
# degrades-to-flat — its Prescriptions are kept, the grouping is dropped — so one
# bad group never fails the whole generation.


def _superset_payload(*, sets_a: int = 3, sets_b: int = 3, round_rest: int = 90) -> str:
    """Two contiguous prescriptions sharing group ``ss1``. Defaults are a *valid*
    Superset; callers vary a field to make it malformed."""

    return f"""
    {{
      "prescriptions": [
        {{
          "exercise_name": "Dumbbell Curl", "sets": {sets_a}, "reps": "10",
          "superset_group": "ss1", "round_rest_seconds": {round_rest}
        }},
        {{
          "exercise_name": "Triceps Pushdown", "sets": {sets_b}, "reps": "10",
          "superset_group": "ss1", "round_rest_seconds": {round_rest}
        }}
      ]
    }}
    """


def test_valid_generated_superset_survives_the_parse_boundary():
    # Act
    generated = parse_generated_session(_superset_payload())

    # Assert — both members keep the group tag and the group-owned round-rest
    groups = [p.superset_group for p in generated.prescriptions]
    assert groups == ["ss1", "ss1"]
    assert all(p.round_rest_seconds == 90 for p in generated.prescriptions)


def test_solo_prescription_has_no_grouping_by_default():
    # Arrange — a plain flat generation carries no Superset fields
    generated = parse_generated_session(VALID_PAYLOAD)

    # Assert
    assert generated.prescriptions[0].superset_group is None
    assert generated.prescriptions[0].round_rest_seconds is None


def test_uneven_generated_superset_degrades_to_flat():
    # Arrange — members with unequal set counts are not a valid Superset (not N rounds)
    payload = _superset_payload(sets_a=3, sets_b=4)

    # Act — degrade-to-flat, not raise: the whole generation still succeeds
    generated = parse_generated_session(payload)

    # Assert — both Prescriptions kept, but ungrouped (tag + round-rest dropped)
    assert len(generated.prescriptions) == 2
    assert [p.exercise_name for p in generated.prescriptions] == [
        "Dumbbell Curl",
        "Triceps Pushdown",
    ]
    assert all(p.superset_group is None for p in generated.prescriptions)
    assert all(p.round_rest_seconds is None for p in generated.prescriptions)


def test_missing_round_rest_generated_superset_degrades_to_flat():
    # Arrange — a group with no round-rest cannot rest at the round boundary
    payload = """
    {
      "prescriptions": [
        {"exercise_name": "Curl", "sets": 3, "reps": "10", "superset_group": "ss1"},
        {"exercise_name": "Pushdown", "sets": 3, "reps": "10", "superset_group": "ss1"}
      ]
    }
    """

    # Act
    generated = parse_generated_session(payload)

    # Assert — ungrouped, both kept
    assert all(p.superset_group is None for p in generated.prescriptions)


def test_lone_member_generated_superset_degrades_to_flat():
    # Arrange — a single tagged Prescription is not a Superset (needs ≥2 members)
    payload = """
    {
      "prescriptions": [
        {"exercise_name": "Curl", "sets": 3, "reps": "10",
         "superset_group": "ss1", "round_rest_seconds": 90},
        {"exercise_name": "Bench", "sets": 3, "reps": "5"}
      ]
    }
    """

    # Act
    generated = parse_generated_session(payload)

    # Assert — the lone member is ungrouped; the solo is untouched
    assert generated.prescriptions[0].superset_group is None
    assert generated.prescriptions[0].round_rest_seconds is None


def test_non_contiguous_generated_superset_degrades_to_flat():
    # Arrange — a solo Prescription sits between two members of the same group
    payload = """
    {
      "prescriptions": [
        {"exercise_name": "Curl", "sets": 3, "reps": "10",
         "superset_group": "ss1", "round_rest_seconds": 90},
        {"exercise_name": "Bench", "sets": 3, "reps": "5"},
        {"exercise_name": "Pushdown", "sets": 3, "reps": "10",
         "superset_group": "ss1", "round_rest_seconds": 90}
      ]
    }
    """

    # Act
    generated = parse_generated_session(payload)

    # Assert — the ss1 members are ungrouped; all three Prescriptions survive
    assert len(generated.prescriptions) == 3
    assert all(p.superset_group is None for p in generated.prescriptions)


def test_a_valid_group_is_kept_when_another_group_degrades():
    # Arrange — ss1 is valid; ss2 is uneven and must degrade without touching ss1
    payload = """
    {
      "prescriptions": [
        {"exercise_name": "Curl", "sets": 3, "reps": "10",
         "superset_group": "ss1", "round_rest_seconds": 90},
        {"exercise_name": "Pushdown", "sets": 3, "reps": "10",
         "superset_group": "ss1", "round_rest_seconds": 90},
        {"exercise_name": "Row", "sets": 4, "reps": "10",
         "superset_group": "ss2", "round_rest_seconds": 60},
        {"exercise_name": "Fly", "sets": 3, "reps": "10",
         "superset_group": "ss2", "round_rest_seconds": 60}
      ]
    }
    """

    # Act
    generated = parse_generated_session(payload)

    # Assert — ss1 preserved, ss2 flattened
    assert [p.superset_group for p in generated.prescriptions] == [
        "ss1",
        "ss1",
        None,
        None,
    ]
