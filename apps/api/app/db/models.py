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

from datetime import date, datetime, timezone

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

    # Enriched detail (Slice 11): execution guidance, a 1–10 difficulty aligned
    # with Fitness Level, and safety precautions — surfaced on the Exercise page
    # and important given the domain's caution around injury and rehab.
    instructions: str | None = Field(default=None)
    difficulty: int | None = Field(default=None)
    precautions: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )


class ExerciseRelationship(SQLModel, table=True):
    """A typed link between two catalog Exercises (CONTEXT.md, Slice 11).

    ``kind`` is ``variation`` (the *same* movement scaled in difficulty) or
    ``alternative`` (a *different* movement with a similar training effect). The
    link is directional: it records that ``to_exercise`` is a Variation/Alternative
    *of* ``from_exercise``. These relationships are what Substitution resolves over,
    lookup-first, before falling back to AI generation."""

    __tablename__ = "exercise_relationship"

    id: int | None = Field(default=None, primary_key=True)
    from_exercise_id: int = Field(foreign_key="exercise.id", index=True)
    to_exercise_id: int = Field(foreign_key="exercise.id", index=True)
    kind: str


class Program(SQLModel, table=True):
    """A user-owned, multi-week training plan (ADR-0001).

    Created by Adopting a Generated Program: a deep copy the user owns and may
    mutate without touching the immutable source. It records the full generation
    parameter set and owns its fully-enumerated ``WorkoutSession`` rows — one per
    (week, day) — followed as a self-paced sequence."""

    __tablename__ = "program"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    created_at: datetime = Field(default_factory=_utcnow)


class WorkoutSession(SQLModel, table=True):
    """A single prescribed workout owned by one user.

    One unified concept (CONTEXT.md): a Session either stands alone (no
    ``program_id``, no Week/Day position) or belongs to a Program, in which case
    it carries its ``program_id``, descriptive ``week``/``day`` labels, and a
    zero-based ``position`` fixing its place in the self-paced sequence. It
    records the training parameters and owns its ordered ExercisePrescriptions."""

    __tablename__ = "workout_session"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    training_type: str
    duration_minutes: int
    created_at: datetime = Field(default_factory=_utcnow)

    # Program linkage — all null for a standalone Session (Slices 3-4 path).
    program_id: int | None = Field(default=None, foreign_key="program.id", index=True)
    objective: str | None = Field(default=None)
    week: int | None = Field(default=None)
    day: int | None = Field(default=None)
    position: int | None = Field(default=None)
    title: str | None = Field(default=None)

    # Regeneration is limited to once per Session in v1 (Slice 10): the flag is
    # set when the user keeps some prescriptions and regenerates the rest, and
    # blocks any further regeneration of this Session.
    has_been_regenerated: bool = Field(default=False)


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


class LoggedSession(SQLModel, table=True):
    """The record of a user performing a Session on a date.

    This is the *record* side of the plan/record split: it references the
    prescribing ``WorkoutSession`` but never mutates it, and one Session may have
    many Logged Sessions (each a separate performance). It owns its ordered
    ``LoggedSet`` rows. Reads are scoped to ``clerk_user_id``."""

    __tablename__ = "logged_session"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    session_id: int = Field(foreign_key="workout_session.id", index=True)
    performed_on: date
    created_at: datetime = Field(default_factory=_utcnow)


class LoggedSet(SQLModel, table=True):
    """One actual set the user performed within a Logged Session.

    Records the real ``reps`` and ``load`` and the user's Performance Feedback as
    ``perceived_difficulty`` (an RPE-style 1–10 score, optional). References the
    catalog ``Exercise`` that was performed; ``position`` fixes display order."""

    __tablename__ = "logged_set"

    id: int | None = Field(default=None, primary_key=True)
    logged_session_id: int = Field(foreign_key="logged_session.id", index=True)
    exercise_id: int = Field(foreign_key="exercise.id", index=True)
    position: int
    reps: int
    load: str | None = Field(default=None)
    perceived_difficulty: int | None = Field(default=None)


class GenerationFeedback(SQLModel, table=True):
    """The user's verdict on a generated/adopted Session (Slice 10).

    A Generation Feedback is a ``positive``/``negative`` verdict with an optional
    free-text ``reason`` — "did the AI give me a good plan?" — and is the trigger
    for Regeneration. It is persisted in its own table, deliberately distinct from
    Performance Feedback (the ``perceived_difficulty`` on a Logged Set): the two
    are never collapsed. Reads are scoped to ``clerk_user_id``; a Session may carry
    several over time, and the latest one drives whether regeneration is allowed."""

    __tablename__ = "generation_feedback"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    session_id: int = Field(foreign_key="workout_session.id", index=True)
    verdict: str
    reason: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)
