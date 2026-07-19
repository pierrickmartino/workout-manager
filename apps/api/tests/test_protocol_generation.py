"""Boundary parsing for multi-week Protocol generation (ADR-0001, ADR-0006).

A Generated Protocol is the immutable AI output: a *fully-enumerated* set of
Sessions — one per (week, day) for every week up front, so Week-2-Push and
Week-5-Push are distinct Sessions rather than a repeated template.
``parse_generated_protocol`` validates raw model output against the schema **and**
against the requested dimensions, so an under-enumerated protocol (a missing week,
a short week) is rejected at the boundary instead of being silently adopted."""

from __future__ import annotations

import pytest

from app.generation.generator import GenerationError
from app.generation.protocol_generator import (
    LlmProtocolGenerator,
    ProtocolGenerationRequest,
    parse_generated_protocol,
)
from tests.fake_llm import FakeStructuredLLM


def _enumerated_json(weeks: int, sessions_per_week: int) -> str:
    sessions = []
    for week in range(1, weeks + 1):
        for day in range(1, sessions_per_week + 1):
            sessions.append(
                f'{{"week": {week}, "day": {day}, "title": "W{week}D{day}", '
                f'"prescriptions": [{{"exercise_name": "Back Squat", "sets": 5, '
                f'"reps": "5"}}]}}'
            )
    return '{"sessions": [' + ", ".join(sessions) + "]}"


def test_parses_a_fully_enumerated_protocol_into_ordered_sessions():
    # Arrange — a 3-week, 2-sessions/week protocol: every week is present up front
    raw = _enumerated_json(weeks=3, sessions_per_week=2)

    # Act
    protocol = parse_generated_protocol(raw, weeks=3, sessions_per_week=2)

    # Assert — all six sessions, each carrying its week/day position
    assert len(protocol.sessions) == 6
    assert sorted({s.week for s in protocol.sessions}) == [1, 2, 3]
    assert protocol.sessions[0].prescriptions[0].exercise_name == "Back Squat"


def test_rejects_a_protocol_missing_a_week():
    # Arrange — only weeks 1 and 2 enumerated, but 3 were requested
    raw = _enumerated_json(weeks=2, sessions_per_week=2)

    # Act / Assert — the enumeration guarantee fails at the boundary
    with pytest.raises(GenerationError):
        parse_generated_protocol(raw, weeks=3, sessions_per_week=2)


def test_rejects_a_week_with_too_few_sessions():
    # Arrange — week 1 has only one session when two per week were requested
    raw = (
        '{"sessions": ['
        '{"week": 1, "day": 1, "prescriptions": []},'
        '{"week": 2, "day": 1, "prescriptions": []},'
        '{"week": 2, "day": 2, "prescriptions": []}'
        "]}"
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        parse_generated_protocol(raw, weeks=2, sessions_per_week=2)


def test_rejects_malformed_json():
    # Act / Assert — unparseable output never passes the boundary
    with pytest.raises(GenerationError):
        parse_generated_protocol("not json", weeks=1, sessions_per_week=1)


# --- Generated Supersets in a Protocol: valid kept, malformed degrades per-session ---


def _one_session_protocol(prescriptions_json: str) -> str:
    return (
        '{"sessions": [{"week": 1, "day": 1, "title": "W1D1", '
        f'"prescriptions": [{prescriptions_json}]}}]}}'
    )


def test_a_valid_generated_superset_survives_protocol_parsing():
    # Arrange — one Session pairing two movements as a valid Superset
    raw = _one_session_protocol(
        '{"exercise_name": "Curl", "sets": 3, "reps": "10", '
        '"superset_group": "ss1", "round_rest_seconds": 90}, '
        '{"exercise_name": "Pushdown", "sets": 3, "reps": "10", '
        '"superset_group": "ss1", "round_rest_seconds": 90}'
    )

    # Act
    protocol = parse_generated_protocol(raw, weeks=1, sessions_per_week=1)

    # Assert — grouping preserved on the Session's members
    prescriptions = protocol.sessions[0].prescriptions
    assert [p.superset_group for p in prescriptions] == ["ss1", "ss1"]


def test_a_malformed_generated_superset_degrades_within_its_session():
    # Arrange — an uneven group in an otherwise fully-enumerated Protocol
    raw = _one_session_protocol(
        '{"exercise_name": "Curl", "sets": 3, "reps": "10", '
        '"superset_group": "ss1", "round_rest_seconds": 90}, '
        '{"exercise_name": "Pushdown", "sets": 5, "reps": "10", '
        '"superset_group": "ss1", "round_rest_seconds": 90}'
    )

    # Act — degrade-to-flat, not a rejected Protocol
    protocol = parse_generated_protocol(raw, weeks=1, sessions_per_week=1)

    # Assert — both Prescriptions kept, ungrouped
    prescriptions = protocol.sessions[0].prescriptions
    assert len(prescriptions) == 2
    assert all(p.superset_group is None for p in prescriptions)


# --- LlmProtocolGenerator wiring, exercised with a fake StructuredLLM port ---


REQUEST = ProtocolGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=2,
    duration_minutes=45,
    weeks=3,
    equipment=["barbell"],
)


def test_protocol_generator_validates_transport_output():
    # Arrange — the transport returns a fully-enumerated 3x2 protocol
    llm = FakeStructuredLLM(text=_enumerated_json(weeks=3, sessions_per_week=2))
    generator = LlmProtocolGenerator(llm)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — parsed result plus the schema-constrained transport request
    assert len(generated.sessions) == 6
    from app.generation.schema import GeneratedProtocol

    call = llm.calls[0]
    assert call["schema"] is GeneratedProtocol
    assert call["max_tokens"] == 32000


def test_protocol_generator_rejects_under_enumerated_output():
    # Arrange — the transport returned only two of the three requested weeks
    llm = FakeStructuredLLM(text=_enumerated_json(weeks=2, sessions_per_week=2))
    generator = LlmProtocolGenerator(llm)

    # Act / Assert — the enumeration guarantee fails at the boundary
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_protocol_generator_propagates_transport_failures():
    # Arrange — the transport itself raised (already-wrapped network / API failure)
    generator = LlmProtocolGenerator(
        FakeStructuredLLM(error=GenerationError("connection reset"))
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_protocol_system_prompt_instructs_the_model_to_use_supersets():
    # Arrange / Act
    llm = FakeStructuredLLM(text=_enumerated_json(weeks=3, sessions_per_week=2))
    LlmProtocolGenerator(llm).generate(REQUEST)

    # Assert — the model is told to prescribe Supersets where appropriate
    assert "superset" in llm.calls[0]["system"].lower()


def test_protocol_generator_degrades_a_malformed_generated_superset():
    # Arrange — a 1x1 Protocol whose only Session carries an uneven Superset
    raw = _one_session_protocol(
        '{"exercise_name": "Curl", "sets": 3, "reps": "10", '
        '"superset_group": "ss1", "round_rest_seconds": 90}, '
        '{"exercise_name": "Pushdown", "sets": 5, "reps": "10", '
        '"superset_group": "ss1", "round_rest_seconds": 90}'
    )
    generator = LlmProtocolGenerator(FakeStructuredLLM(text=raw))
    request = ProtocolGenerationRequest(
        training_type="hypertrophy",
        objective="gain muscle mass",
        sessions_per_week=1,
        duration_minutes=45,
        weeks=1,
        equipment=["dumbbell"],
    )

    # Act — the generation still succeeds, ungrouped
    generated = generator.generate(request)

    # Assert
    prescriptions = generated.sessions[0].prescriptions
    assert all(p.superset_group is None for p in prescriptions)
