"""Boundary parsing for multi-week Program generation (ADR-0001, ADR-0006).

A Generated Program is the immutable AI output: a *fully-enumerated* set of
Sessions — one per (week, day) for every week up front, so Week-2-Push and
Week-5-Push are distinct Sessions rather than a repeated template.
``parse_generated_program`` validates raw model output against the schema **and**
against the requested dimensions, so an under-enumerated program (a missing week,
a short week) is rejected at the boundary instead of being silently adopted."""

from __future__ import annotations

import pytest

from app.generation.generator import GenerationError
from app.generation.program_generator import (
    GENERATION_MODEL,
    AnthropicProgramGenerator,
    ProgramGenerationRequest,
    parse_generated_program,
)


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


def test_parses_a_fully_enumerated_program_into_ordered_sessions():
    # Arrange — a 3-week, 2-sessions/week program: every week is present up front
    raw = _enumerated_json(weeks=3, sessions_per_week=2)

    # Act
    program = parse_generated_program(raw, weeks=3, sessions_per_week=2)

    # Assert — all six sessions, each carrying its week/day position
    assert len(program.sessions) == 6
    assert sorted({s.week for s in program.sessions}) == [1, 2, 3]
    assert program.sessions[0].prescriptions[0].exercise_name == "Back Squat"


def test_rejects_a_program_missing_a_week():
    # Arrange — only weeks 1 and 2 enumerated, but 3 were requested
    raw = _enumerated_json(weeks=2, sessions_per_week=2)

    # Act / Assert — the enumeration guarantee fails at the boundary
    with pytest.raises(GenerationError):
        parse_generated_program(raw, weeks=3, sessions_per_week=2)


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
        parse_generated_program(raw, weeks=2, sessions_per_week=2)


def test_rejects_malformed_json():
    # Act / Assert — unparseable output never passes the boundary
    with pytest.raises(GenerationError):
        parse_generated_program("not json", weeks=1, sessions_per_week=1)


# --- AnthropicProgramGenerator wiring, exercised with a fake Anthropic client ---


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


REQUEST = ProgramGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=2,
    duration_minutes=45,
    weeks=3,
    equipment=["barbell"],
)


def test_anthropic_program_generator_validates_streamed_output():
    # Arrange — the model streams back a fully-enumerated 3x2 program
    client = _FakeClient(text=_enumerated_json(weeks=3, sessions_per_week=2))
    generator = AnthropicProgramGenerator(client)

    # Act
    generated = generator.generate(REQUEST)

    # Assert — parsed result plus the ADR-0006 request config
    assert len(generated.sessions) == 6
    call = client.messages.calls[0]
    assert call["model"] == GENERATION_MODEL
    assert call["thinking"] == {"type": "adaptive"}
    assert call["output_format"] is not None


def test_anthropic_program_generator_rejects_under_enumerated_stream():
    # Arrange — the model streamed only two of the three requested weeks
    client = _FakeClient(text=_enumerated_json(weeks=2, sessions_per_week=2))
    generator = AnthropicProgramGenerator(client)

    # Act / Assert — the enumeration guarantee fails at the boundary
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)


def test_anthropic_program_generator_wraps_api_failures():
    # Arrange — the API call itself blows up
    generator = AnthropicProgramGenerator(
        _FakeClient(error=RuntimeError("connection reset"))
    )

    # Act / Assert
    with pytest.raises(GenerationError):
        generator.generate(REQUEST)
