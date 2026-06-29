"""Multi-week Program generation through Claude (ADR-0001, ADR-0006).

``ProgramGenerator`` is the port the rest of the app depends on; the concrete
``AnthropicProgramGenerator`` calls Claude Opus 4.8 with adaptive thinking and
streaming, constrained to the ``GeneratedProgram`` JSON schema. Output crosses
the boundary through ``parse_generated_program``, which validates it against the
schema **and** the requested dimensions: a Program must be *fully enumerated*
(one Session for every (week, day) of every requested week), so an under-built
generation is rejected rather than adopted half-formed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from pydantic import ValidationError

from app.generation.generator import GenerationError
from app.generation.schema import GeneratedProgram

GENERATION_MODEL = "claude-opus-4-8"
MAX_TOKENS = 32000


@dataclass(frozen=True)
class ProgramGenerationRequest:
    """A request for a full Program: the complete parameter set (ADR-0001)."""

    training_type: str
    objective: str
    sessions_per_week: int
    duration_minutes: int
    weeks: int
    equipment: list[str] = field(default_factory=list)


class ProgramGenerator(Protocol):
    def generate(self, request: ProgramGenerationRequest) -> GeneratedProgram:
        """Produce a schema-valid, fully-enumerated Program for ``request`` or
        raise ``GenerationError`` if the model output cannot be validated."""
        ...


def _ensure_fully_enumerated(
    program: GeneratedProgram, *, weeks: int, sessions_per_week: int
) -> None:
    """Reject a Program that does not enumerate every requested week up front.

    Every week ``1..weeks`` must be present and carry exactly ``sessions_per_week``
    Sessions — the ADR-0001 guarantee that a Program advances week to week rather
    than repeating a template.
    """

    counts: dict[int, int] = {}
    for session in program.sessions:
        counts[session.week] = counts.get(session.week, 0) + 1

    for week in range(1, weeks + 1):
        if counts.get(week, 0) != sessions_per_week:
            raise GenerationError(
                "generated program is not fully enumerated: "
                f"week {week} has {counts.get(week, 0)} sessions, "
                f"expected {sessions_per_week}"
            )


def parse_generated_program(
    raw_json: str, *, weeks: int, sessions_per_week: int
) -> GeneratedProgram:
    """Validate raw model output against the schema and the enumeration guarantee.

    Returns the typed ``GeneratedProgram`` on success; raises ``GenerationError``
    for invalid JSON, any schema violation, or an under-enumerated program, so
    callers never adopt a half-formed Program.
    """

    try:
        program = GeneratedProgram.model_validate_json(raw_json)
    except ValidationError as exc:
        raise GenerationError(
            f"program generation did not match the schema: {exc}"
        ) from exc

    _ensure_fully_enumerated(program, weeks=weeks, sessions_per_week=sessions_per_week)
    return program


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. Generate a complete multi-week "
        "training Program as a fully-enumerated set of Sessions: produce every "
        "week's Sessions up front, with genuine week-to-week progression and "
        "deload weeks, so each week's Sessions differ rather than repeating a "
        "template. Each Session carries its week and day position and a set of "
        "Exercise Prescriptions (exercise name, short description, targeted "
        "muscles, required equipment, sets, reps, rest seconds, tempo, recommended "
        "load). Only prescribe exercises that fit the training type, objective, "
        "session duration, and available equipment. Respond strictly in the "
        "required JSON schema."
    )


def _user_prompt(request: ProgramGenerationRequest) -> str:
    equipment = ", ".join(request.equipment) if request.equipment else "bodyweight only"
    return (
        f"Training type: {request.training_type}\n"
        f"Objective: {request.objective}\n"
        f"Sessions per week: {request.sessions_per_week}\n"
        f"Average session duration: {request.duration_minutes} minutes\n"
        f"Number of weeks: {request.weeks}\n"
        f"Available equipment: {equipment}\n"
        f"Enumerate all {request.weeks * request.sessions_per_week} Sessions."
    )


class AnthropicProgramGenerator:
    """Generates Programs via Claude, schema-constrained and streamed (ADR-0006)."""

    def __init__(self, client) -> None:
        self._client = client

    def generate(self, request: ProgramGenerationRequest) -> GeneratedProgram:
        try:
            with self._client.messages.stream(
                model=GENERATION_MODEL,
                max_tokens=MAX_TOKENS,
                thinking={"type": "adaptive"},
                system=_system_prompt(),
                messages=[{"role": "user", "content": _user_prompt(request)}],
                output_format=GeneratedProgram,
            ) as stream:
                message = stream.get_final_message()
        except Exception as exc:  # network / API failure
            raise GenerationError(f"program generation request failed: {exc}") from exc

        text = "".join(
            block.text for block in message.content if block.type == "text"
        )
        return parse_generated_program(
            text, weeks=request.weeks, sessions_per_week=request.sessions_per_week
        )


__all__ = [
    "ProgramGenerationRequest",
    "ProgramGenerator",
    "AnthropicProgramGenerator",
    "parse_generated_program",
    "GENERATION_MODEL",
]
