"""Multi-week Program generation (ADR-0001, ADR-0006).

``ProgramGenerator`` is the port the rest of the app depends on; the concrete
``LlmProgramGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport, constrained to the ``GeneratedProgram`` JSON schema. Output crosses
the boundary through ``parse_generated_program``, which validates it against the
schema **and** the requested dimensions: a Program must be *fully enumerated*
(one Session for every (week, day) of every requested week), so an under-built
generation is rejected rather than adopted half-formed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from pydantic import ValidationError

from app.generation.generator import GenerationError
from app.generation.llm.port import StructuredLLM
from app.generation.schema import GeneratedProgram

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


class LlmProgramGenerator:
    """Generates Programs via the ``StructuredLLM`` transport (ADR-0006).

    The transport constrains output to ``GeneratedProgram``; this generator then
    validates the raw text at its boundary, including the ADR-0001 full-enumeration
    check, so an under-built Program raises ``GenerationError`` for any provider."""

    def __init__(self, llm: StructuredLLM) -> None:
        self._llm = llm

    def generate(self, request: ProgramGenerationRequest) -> GeneratedProgram:
        text = self._llm.complete(
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedProgram,
            max_tokens=MAX_TOKENS,
        )
        return parse_generated_program(
            text, weeks=request.weeks, sessions_per_week=request.sessions_per_week
        )


__all__ = [
    "ProgramGenerationRequest",
    "ProgramGenerator",
    "LlmProgramGenerator",
    "parse_generated_program",
]
