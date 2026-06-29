"""SQLModel table definitions.

The Fitness Profile (keyed by Clerk user id) is a mutable snapshot of "now".
Beyond the demographic scalars it carries three structured collections stored
as JSON: ``fitness_levels`` (a 1–10 score **per training type**),
``preferences`` (non-medical Preferences / Limitations), and
``sensitive_constraints`` (specific Sensitive Constraint types). The
``is_sensitive`` bypass gate is *derived* from the latter, never stored.

The catalog entities arrive in Slice 3. ``Exercise`` is the shared, global
movement definition deduped by ``normalized_name`` and flagged with a
``provenance`` (ADR-0002). ``WorkoutSession`` is a user-owned, standalone plan
composed of ``ExercisePrescription`` rows, each referencing one catalog
Exercise — the prescription is the *use* of an Exercise in one Session, distinct
from the Exercise definition itself."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


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


class Exercise(SQLModel, table=True):
    """A movement definition in the shared, global catalog.

    Identity is the ``normalized_name`` (unique): the deterministic dedup key from
    ``app.domain.exercise.normalize_name``. ``provenance`` records whether the
    entry was AI-invented or human-curated. One Exercise is reused across all
    users and across every Session that prescribes it."""

    __tablename__ = "exercise"

    id: int | None = Field(default=None, primary_key=True)
    normalized_name: str = Field(index=True, unique=True)
    name: str
    description: str | None = Field(default=None)
    provenance: str
    targeted_muscles: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    required_equipment: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )


class WorkoutSession(SQLModel, table=True):
    """A single prescribed workout owned by one user.

    In this slice it is always *standalone* — generated on its own with no parent
    Program and no Week/Day position. It records the request parameters
    (training type, duration) and owns its ordered ExercisePrescriptions."""

    __tablename__ = "workout_session"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    training_type: str
    duration_minutes: int
    created_at: datetime = Field(default_factory=_utcnow)


class ExercisePrescription(SQLModel, table=True):
    """The prescription of one Exercise inside a Session.

    Carries the sets, reps, rest, tempo, and recommended load the user is told to
    perform, and references a catalog ``Exercise`` (never embeds the definition).
    ``position`` fixes its order within the Session."""

    __tablename__ = "exercise_prescription"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="workout_session.id", index=True)
    exercise_id: int = Field(foreign_key="exercise.id", index=True)
    position: int
    sets: int
    reps: str
    rest_seconds: int | None = Field(default=None)
    tempo: str | None = Field(default=None)
    recommended_load: str | None = Field(default=None)
