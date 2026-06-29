"""SQLModel table definitions.

The persisted entity is the Fitness Profile keyed by the Clerk user id — a
mutable snapshot of "now" (metric *history* is out of scope, see Slice 12).
Beyond the demographic scalars it carries three structured collections stored
as JSON: ``fitness_levels`` (a 1–10 score **per training type**),
``preferences`` (non-medical Preferences / Limitations), and
``sensitive_constraints`` (specific Sensitive Constraint types). The
``is_sensitive`` bypass gate is *derived* from the latter, never stored."""

from __future__ import annotations

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


class Profile(SQLModel, table=True):
    __tablename__ = "profile"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, unique=True)
    display_name: str | None = Field(default=None)

    # Demographics — the mutable snapshot of "now".
    gender: str | None = Field(default=None)
    age: int | None = Field(default=None)
    height_cm: float | None = Field(default=None)
    weight_kg: float | None = Field(default=None)
    training_habits: str | None = Field(default=None)
    recent_workout: str | None = Field(default=None)

    # Structured collections (JSON columns).
    default_equipment: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    fitness_levels: dict[str, int] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    preferences: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    sensitive_constraints: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
