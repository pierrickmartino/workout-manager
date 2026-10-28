"""The Warm-up Suggestion generator (ADR-0144, ADR-0006).

``WarmUpGenerator`` is the port the warm-up service depends on. The concrete
``LlmWarmUpGenerator`` makes one synchronous call through the provider-agnostic
``StructuredLLM`` transport, constrained to the ``GeneratedWarmUp`` schema, and validates the
raw text at its own ``parse_warm_up`` boundary: malformed output raises ``GenerationError`` and
nothing downstream sees it. Each call is recorded under ``GeneratorKind.WARM_UP``.

The prompt carries the muscles (most important first), movements with no muscle data, the
equipment, the Sensitive Constraints when present, the catalog drills to prefer, the 4–6 drill
count and the 5–8 minute budget. Readiness is deliberately not an input."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.warm_up import (
    MAX_DRILL_REST_SECONDS,
    MAX_DRILLS,
    MAX_MINUTES,
    MIN_DRILLS,
    MIN_MINUTES,
    WarmUpInput,
)
from app.generation.llm.port import StructuredLLM
from app.generation.monitoring.call import GenerationCallContext, GeneratorKind
from app.generation.schema import GeneratedWarmUp
from app.generation.structured import parse_or_raise

MAX_TOKENS = 3000
_SUBJECT = "warm-up suggestion"


@dataclass(frozen=True)
class WarmUpRequest:
    """What one Warm-up Suggestion is generated from: the Session and Profile input
    (``derive_warm_up_input``) plus the catalog drills the model may reuse."""

    derived: WarmUpInput
    candidate_drills: tuple[str, ...] = ()


class WarmUpGenerator(Protocol):
    def generate(self, request: WarmUpRequest) -> GeneratedWarmUp:
        """Produce a schema-valid Warm-up Suggestion for ``request`` or raise
        ``GenerationError``."""
        ...


def parse_warm_up(raw_json: str) -> GeneratedWarmUp:
    """The generator's boundary: raw model text in, a validated suggestion out, or
    ``GenerationError``."""

    return parse_or_raise(raw_json, GeneratedWarmUp, subject=_SUBJECT)


def _system_prompt() -> str:
    return (
        "You are a strength and conditioning coach. Propose a short, general warm-up of "
        f"{MIN_DRILLS} to {MAX_DRILLS} mobility and activation drills, about {MIN_MINUTES} "
        f"to {MAX_MINUTES} minutes in total, that prepares the listed muscles for the "
        "session ahead, most important muscles first. Use only the available equipment; "
        "bodyweight is always available. Prefer drills from the catalog list, spelled "
        "exactly as listed; invent a drill only when none fits. Each drill is one set: give "
        "quantity_kind 'repetitions' or 'duration' (amount in seconds), a load_kind of "
        "'bodyweight' or 'qualitative' with a short load_text such as 'light band' (never a "
        f"weight in kg), and rest_seconds between 0 and {MAX_DRILL_REST_SECONDS}. For a "
        "drill not in the catalog, also give its targeted muscles, required equipment, a "
        "short description and step-by-step instructions. Respect every constraint "
        "absolutely. Give estimated_minutes for the whole warm-up. Respond strictly in the "
        "required JSON schema."
    )


def _listed(values: tuple[str, ...], empty: str) -> str:
    return ", ".join(values) if values else empty


def _user_prompt(request: WarmUpRequest) -> str:
    derived = request.derived
    lines = [
        f"Muscles to prepare, most important first: {_listed(derived.muscle_names, 'full body')}",
    ]
    if derived.unmapped_exercises:
        lines.append(
            "Movements in the session (no muscle data): "
            + ", ".join(derived.unmapped_exercises)
        )
    lines.append(f"Available equipment: {_listed(derived.equipment, 'bodyweight')}")
    if derived.has_sensitive_constraint:
        lines.append(
            "Sensitive constraints to respect: " + ", ".join(derived.sensitive_constraints)
        )
    lines.append(
        f"Catalog drills to prefer: {_listed(request.candidate_drills, 'none available')}"
    )
    lines.append(
        f"Propose {MIN_DRILLS}-{MAX_DRILLS} drills totalling {MIN_MINUTES}-{MAX_MINUTES} "
        "minutes."
    )
    return "\n".join(lines)


class LlmWarmUpGenerator:
    """Generates a Warm-up Suggestion via the ``StructuredLLM`` transport (ADR-0006)."""

    def __init__(self, llm: StructuredLLM, *, clerk_user_id: str | None = None) -> None:
        self._llm = llm
        # The user the call is made for, attributed in the AI audit log (ADR-0135).
        self._clerk_user_id = clerk_user_id

    def generate(self, request: WarmUpRequest) -> GeneratedWarmUp:
        text = self._llm.complete(
            system=_system_prompt(),
            user=_user_prompt(request),
            schema=GeneratedWarmUp,
            max_tokens=MAX_TOKENS,
            context=GenerationCallContext(
                generator_kind=GeneratorKind.WARM_UP,
                clerk_user_id=self._clerk_user_id,
            ),
        )
        return parse_warm_up(text)


__all__ = [
    "LlmWarmUpGenerator",
    "WarmUpGenerator",
    "WarmUpRequest",
    "parse_warm_up",
]
