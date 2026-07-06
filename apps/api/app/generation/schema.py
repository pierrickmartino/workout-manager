"""Structured-output schema for AI generation (ADR-0006).

These Pydantic models are the strict JSON schema Claude is constrained to emit;
they map directly onto the domain types — a ``GeneratedSession`` of
``GeneratedExercisePrescription`` rows, each carrying the catalog-Exercise shape
(name, description, muscles, equipment) alongside the prescription (sets, reps,
rest, tempo, recommended load). Validating against these models at the boundary
turns "did the AI return well-formed data?" into a guarantee."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.load import parse_load


class GeneratedExercisePrescription(BaseModel):
    """One prescribed Exercise: the catalog definition plus its prescription.

    The AI emits ``recommended_load`` as the free-text load vocabulary it is fluent
    in (``"70kg"``, ``"bodyweight"``, ``"70% 1RM"``). ``typed_load`` is the
    generation-ingestion boundary (ADR-0010): it runs :func:`parse_load` once so
    everything downstream persists and reads a typed ``{kind, text, ...}`` Load
    instead of re-guessing the string forever."""

    exercise_name: str
    exercise_description: str | None = None
    targeted_muscles: list[str] = Field(default_factory=list)
    required_equipment: list[str] = Field(default_factory=list)
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: str | None = None

    @property
    def typed_load(self) -> dict | None:
        """The prescription's load as a typed ``ParsedLoad`` dict, or ``None`` when
        the AI prescribed no load."""

        if self.recommended_load is None:
            return None
        return parse_load(self.recommended_load).to_dict()


class GeneratedSession(BaseModel):
    """The AI's output for one standalone Session: ordered prescriptions.

    ``prescriptions`` is required and non-empty: ``{}`` or ``{"prescriptions": []}``
    is malformed upstream output that would otherwise persist an empty Session, so
    it is rejected at the boundary as a schema violation."""

    prescriptions: list[GeneratedExercisePrescription] = Field(min_length=1)


class GeneratedSubstitute(BaseModel):
    """The AI's output for a single substitute Exercise (Slice 11 fallback).

    Used only when no catalog Variation/Alternative fits the user's equipment and
    constraints. It carries the full enriched catalog shape so the new movement
    enters the catalog complete — stored once, as ``ai_generated``, for everyone."""

    exercise_name: str
    exercise_description: str | None = None
    instructions: str | None = None
    difficulty: int | None = None
    targeted_muscles: list[str] = Field(default_factory=list)
    required_equipment: list[str] = Field(default_factory=list)
    precautions: list[str] = Field(default_factory=list)


class GeneratedProtocolSession(BaseModel):
    """One Session inside a Generated Protocol, fixed to a Week/Day position.

    The ``week``/``day`` labels are descriptive ordering (ADR-0001) — not calendar
    dates — and make each week's Session distinct so per-week progression and
    deloads are first-class (Week-2-Push is not Week-5-Push)."""

    week: int
    day: int
    title: str | None = None
    prescriptions: list[GeneratedExercisePrescription] = Field(min_length=1)


class GeneratedProtocol(BaseModel):
    """The AI's output for a multi-week Protocol: every week's Sessions up front.

    Immutable and fully enumerated — there is no repeated weekly template; one
    ``GeneratedProtocolSession`` exists for every (week, day) the request asked
    for. Adoption deep-copies it into a user-owned, mutable Protocol."""

    sessions: list[GeneratedProtocolSession] = Field(min_length=1)
