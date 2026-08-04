"""Standalone Session generation (ADR-0006).

``SessionGenerator`` is the port the rest of the app depends on; the concrete
``LlmSessionGenerator`` runs through the provider-agnostic ``StructuredLLM``
transport, constrained to the ``GeneratedSession`` JSON schema. Whatever the
provider, output crosses the boundary through ``parse_generated_session``, which
validates it against the schema and raises ``GenerationError`` on anything
malformed — so an unparseable generation is handled, never passed downstream."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.generation.llm.port import GenerationError, StructuredLLM
from app.generation.monitoring.call import (
    GenerationCallContext,
    GeneratorKind,
    TraceCapture,
)
from app.generation.schema import GeneratedSession
from app.generation.structured import generate_structured, parse_or_raise
from app.generation.superset_degrade import degrade_session_to_flat

MAX_TOKENS = 8000


@dataclass(frozen=True)
class GenerationRequest:
    """A request for one standalone Session: type, duration, and equipment.

    ``has_sensitive_constraint`` carries the user's safety flag into generation
    (ADR-0023): when set, the prompt instructs no Supersets and any group that slips
    through is degraded to flat, so a Sensitive-Constraint user is never handed one.
    """

    training_type: str
    duration_minutes: int
    equipment: list[str] = field(default_factory=list)
    has_sensitive_constraint: bool = False


class SessionGenerator(Protocol):
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        """Produce a schema-valid Session for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def parse_generated_session(raw_json: str) -> GeneratedSession:
    """Validate raw model output against the schema at the boundary.

    Returns the typed ``GeneratedSession`` on success; raises ``GenerationError``
    for invalid JSON or any schema violation, so callers never persist
    half-formed generations. Any invalid generated Superset is degraded to flat
    (ADR-0023) rather than failing the request.
    """

    parsed = parse_or_raise(raw_json, GeneratedSession, subject="generation")
    return degrade_session_to_flat(parsed)


def _system_prompt(*, has_sensitive_constraint: bool = False) -> str:
    return (
        "You are a strength and conditioning coach. Generate a single, standalone "
        "training Session as a set of Exercise Prescriptions. For each prescription "
        "give the exercise name, a short description, targeted muscles, required "
        "equipment, and the sets, reps, rest (seconds), tempo, and recommended load. "
        + _superset_guidance(has_sensitive_constraint)
        + " Only prescribe exercises that fit the requested training type, duration, "
        "and the available equipment. Respond strictly in the required JSON schema."
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


def _user_prompt(request: GenerationRequest) -> str:
    equipment = ", ".join(request.equipment) if request.equipment else "bodyweight only"
    return (
        f"Training type: {request.training_type}\n"
        f"Duration: {request.duration_minutes} minutes\n"
        f"Available equipment: {equipment}"
    )


class LlmSessionGenerator:
    """Generates Sessions via the ``StructuredLLM`` transport (ADR-0006).

    The transport constrains output to ``GeneratedSession`` and returns the raw
    JSON text; this generator validates it at its ``parse_*`` boundary before
    returning, so a malformed generation raises ``GenerationError`` regardless of
    which provider produced it."""

    def __init__(
        self, llm: StructuredLLM, *, kind: GeneratorKind = GeneratorKind.SESSION
    ) -> None:
        self._llm = llm
        self._kind = kind

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        capture = TraceCapture()
        generated = generate_structured(
            llm=self._llm,
            system=_system_prompt(
                has_sensitive_constraint=request.has_sensitive_constraint
            ),
            user=_user_prompt(request),
            schema=GeneratedSession,
            max_tokens=MAX_TOKENS,
            subject="generation",
            context=GenerationCallContext(generator_kind=self._kind, capture=capture),
        )
        generated = degrade_session_to_flat(
            generated, has_sensitive_constraint=request.has_sensitive_constraint
        )
        # Stamp the originating call's trace id onto the artifact (#274) — a new object,
        # never a mutation, consistent with the immutability of Generated content.
        return generated.model_copy(update={"trace_id": capture.trace_id})


__all__ = [
    "GenerationError",
    "GenerationRequest",
    "SessionGenerator",
    "LlmSessionGenerator",
    "parse_generated_session",
]
