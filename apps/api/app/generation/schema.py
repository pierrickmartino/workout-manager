"""Structured-output schema for AI generation (ADR-0006).

These Pydantic models are the strict JSON schema Claude is constrained to emit;
they map directly onto the domain types — a ``GeneratedSession`` of
``GeneratedExercisePrescription`` rows, each carrying the catalog-Exercise shape
(name, description, muscles, equipment) alongside the prescription (sets, reps,
rest, tempo, recommended load). Validating against these models at the boundary
turns "did the AI return well-formed data?" into a guarantee."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GeneratedExercisePrescription(BaseModel):
    """One prescribed Exercise: the catalog definition plus its prescription."""

    exercise_name: str
    exercise_description: str | None = None
    targeted_muscles: list[str] = Field(default_factory=list)
    required_equipment: list[str] = Field(default_factory=list)
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: str | None = None


class GeneratedSession(BaseModel):
    """The AI's output for one standalone Session: ordered prescriptions."""

    prescriptions: list[GeneratedExercisePrescription] = Field(default_factory=list)
