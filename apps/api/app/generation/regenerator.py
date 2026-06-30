"""Session Regeneration (ADR-0006).

``SessionRegenerator`` is the port the regeneration service depends on; the
concrete ``LlmSessionRegenerator`` runs through the provider-agnostic
``StructuredLLM`` transport, constrained to the ``GeneratedSession`` JSON schema.
The output is the set of **replacement** Exercise Prescriptions for the
prescriptions the user chose to drop — conditioned on the kept Prescriptions and
the negative Generation Feedback reason so progression stays coherent
(CONTEXT.md). Output crosses the boundary through ``parse_generated_session``
(reused from the generator), so a malformed regeneration raises
``GenerationError`` and never reaches the user's copy."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.generation.generator import parse_generated_session
from app.generation.llm.port import StructuredLLM
from app.generation.schema import GeneratedSession

MAX_TOKENS = 8000


@dataclass(frozen=True)
class KeptPrescription:
    """A prescription the user kept — context the AI must build around."""

    exercise_name: str
    sets: int
    reps: str
    recommended_load: str | None = None


@dataclass(frozen=True)
class RegenerationRequest:
    """A request to regenerate one Session's dropped prescriptions.

    Carries the Session parameters, the prescriptions the user kept (so the AI
    coheres the replacements with them), and the free-text reason from the
    negative Generation Feedback that steers what changes.
    """

    training_type: str
    duration_minutes: int
    kept: list[KeptPrescription] = field(default_factory=list)
    reason: str | None = None


class SessionRegenerator(Protocol):
    def regenerate(self, request: RegenerationRequest) -> GeneratedSession:
        """Produce schema-valid replacement prescriptions for ``request`` or raise
        ``GenerationError`` if the model output cannot be validated."""
        ...


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach revising a training Session. The "
        "user kept some Exercise Prescriptions and wants the rest replaced. Generate "
        "only the replacement prescriptions, built to complement the kept ones and "
        "to address the user's stated reason for disliking the original. Keep the "
        "Session coherent for the training type and duration, and only prescribe "
        "exercises that fit the available context. For each replacement give the "
        "exercise name, a short description, targeted muscles, required equipment, "
        "and the sets, reps, rest (seconds), tempo, and recommended load. Respond "
        "strictly in the required JSON schema."
    )


def _kept_line(prescription: KeptPrescription) -> str:
    load = (
        f" @ {prescription.recommended_load}"
        if prescription.recommended_load
        else ""
    )
    return (
        f"- {prescription.exercise_name}: "
        f"{prescription.sets}x{prescription.reps}{load}"
    )


def _user_prompt(request: RegenerationRequest) -> str:
    if request.kept:
        kept = "\n".join(_kept_line(p) for p in request.kept)
    else:
        kept = "(none — replace the whole Session)"
    reason = request.reason or "(no specific reason given)"
    return (
        f"Training type: {request.training_type}\n"
        f"Duration: {request.duration_minutes} minutes\n"
        f"Prescriptions the user kept (do not regenerate these):\n{kept}\n"
        f"Reason the user disliked the original: {reason}\n"
        "Generate the replacement prescriptions only."
    )


class LlmSessionRegenerator:
    """Regenerates dropped prescriptions via the ``StructuredLLM`` transport.

    The transport constrains output to ``GeneratedSession``; this regenerator
    validates the raw text at the shared boundary, so a malformed regeneration
    raises ``GenerationError`` regardless of provider (ADR-0006)."""

    def __init__(self, llm: StructuredLLM) -> None:
        self._llm = llm

    def regenerate(self, request: RegenerationRequest) -> GeneratedSession:
        text = self._llm.complete(
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedSession,
            max_tokens=MAX_TOKENS,
        )
        return parse_generated_session(text)


__all__ = [
    "KeptPrescription",
    "RegenerationRequest",
    "SessionRegenerator",
    "LlmSessionRegenerator",
]
