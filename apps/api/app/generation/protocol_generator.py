"""Multi-week Protocol generation (ADR-0001, ADR-0006).

``ProtocolGenerator`` is the port the rest of the app depends on; the concrete
``LlmProtocolGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport, constrained to the ``GeneratedProtocol`` JSON schema. Output crosses
the boundary through ``parse_generated_protocol``, which validates it against the
schema **and** the requested dimensions: a Protocol must be *fully enumerated*
(one Session for every (week, day) of every requested week), so an under-built
generation is rejected rather than adopted half-formed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.generation.generator import GenerationError
from app.generation.llm.port import StructuredLLM
from app.generation.monitoring.call import GenerationCallContext, GeneratorKind
from app.generation.schema import GeneratedProtocol
from app.generation.structured import generate_structured, parse_or_raise
from app.generation.superset_degrade import degrade_protocol_to_flat

MAX_TOKENS = 32000


@dataclass(frozen=True)
class ProtocolGenerationRequest:
    """A request for a full Protocol: the complete parameter set (ADR-0001).

    ``has_sensitive_constraint`` carries the user's safety flag into generation
    (ADR-0023): when set, the prompt instructs no Supersets and any group that slips
    through is degraded to flat, so a Sensitive-Constraint user is never handed one.
    It is a plain field so it survives the async worker's dict round-trip.
    """

    training_type: str
    objective: str
    sessions_per_week: int
    duration_minutes: int
    weeks: int
    equipment: list[str] = field(default_factory=list)
    has_sensitive_constraint: bool = False


class ProtocolGenerator(Protocol):
    def generate(self, request: ProtocolGenerationRequest) -> GeneratedProtocol:
        """Produce a schema-valid, fully-enumerated Protocol for ``request`` or
        raise ``GenerationError`` if the model output cannot be validated."""
        ...


def _ensure_fully_enumerated(
    protocol: GeneratedProtocol, *, weeks: int, sessions_per_week: int
) -> None:
    """Reject a Protocol that does not enumerate every requested week up front.

    Every week ``1..weeks`` must be present and carry exactly ``sessions_per_week``
    Sessions — the ADR-0001 guarantee that a Protocol advances week to week rather
    than repeating a template.
    """

    counts: dict[int, int] = {}
    for session in protocol.sessions:
        counts[session.week] = counts.get(session.week, 0) + 1

    for week in range(1, weeks + 1):
        if counts.get(week, 0) != sessions_per_week:
            raise GenerationError(
                "generated protocol is not fully enumerated: "
                f"week {week} has {counts.get(week, 0)} sessions, "
                f"expected {sessions_per_week}"
            )


def parse_generated_protocol(
    raw_json: str, *, weeks: int, sessions_per_week: int
) -> GeneratedProtocol:
    """Validate raw model output against the schema and the enumeration guarantee.

    Returns the typed ``GeneratedProtocol`` on success; raises ``GenerationError``
    for invalid JSON, any schema violation, or an under-enumerated protocol, so
    callers never adopt a half-formed Protocol. Any invalid generated Superset is
    degraded to flat per Session (ADR-0023) rather than failing the request.
    """

    protocol = parse_or_raise(
        raw_json, GeneratedProtocol, subject="protocol generation"
    )
    protocol = degrade_protocol_to_flat(protocol)
    _ensure_fully_enumerated(protocol, weeks=weeks, sessions_per_week=sessions_per_week)
    return protocol


def _system_prompt(*, has_sensitive_constraint: bool = False) -> str:
    base = (
        "You are a strength and conditioning coach. Generate a complete multi-week "
        "training Protocol as a fully-enumerated set of Sessions: produce every "
        "week's Sessions up front, with genuine week-to-week progression and "
        "deload weeks, so each week's Sessions differ rather than repeating a "
        "template. Each Session carries its week and day position and a set of "
        "Exercise Prescriptions (exercise name, short description, targeted "
        "muscles, required equipment, sets, reps, rest seconds, tempo, recommended "
        "load). "
    )
    return base + _superset_guidance(has_sensitive_constraint) + (
        " Only prescribe exercises that fit the training type, objective, "
        "session duration, and available equipment. Respond strictly in the "
        "required JSON schema."
    )


def _superset_guidance(has_sensitive_constraint: bool) -> str:
    """The Superset instruction, which flips to a hard prohibition for a user with a
    Sensitive Constraint (ADR-0023): they must never be prescribed a Superset."""

    if has_sensitive_constraint:
        return (
            "This user has a sensitive constraint (injury, rehabilitation, "
            "postpartum, or a flagged medical limitation): do NOT prescribe any "
            "Supersets. Leave superset_group null on every prescription and give "
            "each exercise its own rest."
        )
    return (
        "Where two or more movements are best trained back-to-back — antagonist "
        "pairs or accessory work — prescribe a Superset: give those contiguous "
        "prescriptions a shared superset_group tag, equal set counts (a Superset is "
        "N rounds), and a single round_rest_seconds on each member for the rest "
        "taken once per round. Leave superset_group null for a solo exercise."
    )


def _user_prompt(request: ProtocolGenerationRequest) -> str:
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


class LlmProtocolGenerator:
    """Generates Protocols via the ``StructuredLLM`` transport (ADR-0006).

    The transport constrains output to ``GeneratedProtocol``; this generator then
    validates the raw text at its boundary, including the ADR-0001 full-enumeration
    check, so an under-built Protocol raises ``GenerationError`` for any provider."""

    def __init__(
        self, llm: StructuredLLM, *, kind: GeneratorKind = GeneratorKind.PROTOCOL
    ) -> None:
        self._llm = llm
        self._kind = kind

    def generate(self, request: ProtocolGenerationRequest) -> GeneratedProtocol:
        protocol = generate_structured(
            llm=self._llm,
            system=_system_prompt(
                has_sensitive_constraint=request.has_sensitive_constraint
            ),
            user=_user_prompt(request),
            schema=GeneratedProtocol,
            max_tokens=MAX_TOKENS,
            subject="protocol generation",
            context=GenerationCallContext(generator_kind=self._kind),
        )
        protocol = degrade_protocol_to_flat(
            protocol, has_sensitive_constraint=request.has_sensitive_constraint
        )
        _ensure_fully_enumerated(
            protocol,
            weeks=request.weeks,
            sessions_per_week=request.sessions_per_week,
        )
        return protocol


__all__ = [
    "ProtocolGenerationRequest",
    "ProtocolGenerator",
    "LlmProtocolGenerator",
    "parse_generated_protocol",
]
