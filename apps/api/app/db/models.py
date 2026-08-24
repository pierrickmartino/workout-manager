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

from app.domain.appearance import DEFAULT_KEEP_SCREEN_AWAKE, DEFAULT_MODE


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

    # The user's preferred default rest-timer duration, in whole seconds. Nullable:
    # when unset the Live Session's rest countdown falls back to each Exercise
    # Prescription's own ``rest_seconds`` (F5 Slice 4). An independent settings
    # value, not part of the gamification projection (ADR-0019).
    default_rest_seconds: int | None = Field(default=None)

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


class AppearancePreference(SQLModel, table=True):
    """One user's Interface Preference: their Mode + Keep Screen Awake, keyed by user.

    A deliberately *separate* store from ``Profile`` (ADR-0047) so an Interface
    Preference never enters generation or the cache key — one row per user. The
    physical ``appearance_*`` name stays as an incidental legacy detail even though
    the concept generalised to an *Interface Preference* (ADR-0055): a rename buys
    nothing functional. ``mode`` is the raw value of ``app.domain.appearance.Mode``
    (``light`` | ``dark`` | ``system``); ``keep_screen_awake`` is the behavioural
    facet. Absence of a row means the shipped defaults (Dark + Keep-Screen-Awake
    on), so this table only ever holds a *deliberate* choice and existing users are
    never disturbed on deploy."""

    __tablename__ = "appearance_preference"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True, unique=True)
    mode: str = Field(default=DEFAULT_MODE.value)
    keep_screen_awake: bool = Field(default=DEFAULT_KEEP_SCREEN_AWAKE)


class AppSetting(SQLModel, table=True):
    """A single global app-setting: one ``key`` → ``value`` row for the whole app.

    The store behind the **Active Skin** (ADR-0048) — the codebase's first global,
    mutable app-state singleton. Unlike every other table this is *not* keyed by
    ``clerk_user_id``: a setting like the Active Skin is app-wide, one logical row
    per key (``active_skin``), changed only by an admin publishing. Kept a generic
    key/value shape so a future global setting reuses the same store rather than
    growing another one-row table. The 0026 migration seeds ``active_skin=pulse``
    (ADR-0048); absence of the row still defaults to PULSE in the repository."""

    __tablename__ = "app_setting"

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: str


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
    # ``targeted_muscles`` is the flat, durable union the F3 Muscle Group roll-up
    # reads (ADR-0011). ``primary_muscles`` / ``secondary_muscles`` are the
    # Primary/Secondary emphasis annotation layered on top (ADR-0016): populated
    # only where enrichment or a curator actually asserts a split, never
    # backfilled by guessing. An empty split means "no asserted primacy", not
    # "all primary" — the SPECS map falls back to the flat union in that case.
    targeted_muscles: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    primary_muscles: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    secondary_muscles: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    required_equipment: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )

    # Enriched detail (Slice 11): execution guidance, a 1–10 difficulty aligned
    # with Fitness Level, and safety precautions — surfaced on the Exercise page
    # and important given the domain's caution around injury and rehab.
    #
    # ``instructions`` is an ordered list of Execution Steps (ADR-0015), stored as
    # JSON — one step per authored line, never a prose blob re-guessed on every read.
    instructions: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    difficulty: int | None = Field(default=None)
    precautions: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    # An optional Exercise Image: a single curated-source illustration reference
    # (a URL / asset key) shown on Exercise Detail. Curator-only and never
    # AI-fabricated — a misleading generated picture is a safety hazard in an
    # injury/rehab-cautious domain — and part of the Enriched (gold) tier, so its
    # absence never holds a movement below the Listable bar (ADR-0041).
    image: str | None = Field(default=None)


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


class Protocol(SQLModel, table=True):
    """A user-owned, multi-week training plan (ADR-0001).

    Created by Adopting a Generated Protocol: a deep copy the user owns and may
    mutate without touching the immutable source. It records the full generation
    parameter set and owns its fully-enumerated ``WorkoutSession`` rows — one per
    (week, day) — followed as a self-paced sequence."""

    __tablename__ = "protocol"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    training_type: str
    objective: str
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    # The user-editable Protocol name (Pulse's "PROTOCOL ID", ADR-0021). Nullable and
    # never backfilled: an adopted Protocol is born unnamed, and read paths fall back
    # to a derived ``objective · training_type`` label until the user sets one in the
    # Builder's config panel.
    name: str | None = Field(default=None)
    # Operational AI-usage lineage (ADR-0039, #274): the trace id of the Generation
    # Call that produced the Generated Protocol this copy was Adopted from, deep-copied
    # here at adoption so operator feedback can trace back to the exact call. Nullable —
    # absent when no monitoring backend was configured. Never mutated after creation.
    trace_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class WorkoutSession(SQLModel, table=True):
    """A single prescribed workout owned by one user.

    One unified concept (CONTEXT.md): a Session either stands alone (no
    ``protocol_id``, no Week/Day position) or belongs to a Protocol, in which case
    it carries its ``protocol_id``, descriptive ``week``/``day`` labels, and a
    zero-based ``position`` fixing its place in the self-paced sequence. It
    records the training parameters and owns its ordered ExercisePrescriptions."""

    __tablename__ = "workout_session"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    training_type: str
    duration_minutes: int
    created_at: datetime = Field(default_factory=_utcnow)

    # Session Provenance (CONTEXT.md, ADR-0040): how this plan came to exist —
    # ``ai_generated`` (the generation pipeline: standalone generation or a Protocol
    # Session adopted from a Generated Protocol) or ``user_authored`` (a Hand-Authored
    # Session, built by hand with no AI call). Every existing creation path is AI, so the
    # default is ``ai_generated`` and the 0023 migration backfills pre-existing rows;
    # ``user_authored`` arrives with the Hand-Authored Session feature that builds on this
    # column. Load-bearing, not cosmetic: Generation Feedback and Regeneration are hidden
    # for ``user_authored`` plans (offering "the AI gave me a bad plan" on a hand-written
    # plan is nonsensical). See ``app.domain.session_provenance.SessionProvenance``.
    provenance: str = Field(default="ai_generated")

    # Protocol linkage — all null for a standalone Session (Slices 3-4 path).
    protocol_id: int | None = Field(default=None, foreign_key="protocol.id", index=True)
    objective: str | None = Field(default=None)
    week: int | None = Field(default=None)
    day: int | None = Field(default=None)
    position: int | None = Field(default=None)
    title: str | None = Field(default=None)

    # Regeneration is limited to once per Session in v1 (Slice 10): the flag is
    # set when the user keeps some prescriptions and regenerates the rest, and
    # blocks any further regeneration of this Session.
    has_been_regenerated: bool = Field(default=False)

    # Operational AI-usage lineage (ADR-0039, #274): the trace id of the Generation
    # Call this Session traces to — seeded at creation (the standalone generation call,
    # or the originating Protocol generation on Adopt) and re-stamped on Regeneration to
    # the regeneration's own call, so post-regeneration feedback maps to the regeneration
    # rather than the superseded call. Nullable (absent with no backend); written only at
    # creation and on Regeneration, never otherwise mutated.
    trace_id: str | None = Field(default=None)


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
    # Typed Prescribed Quantity (ADR-0050): a ``{kind, text, ...payload}`` value object
    # matching ``app.domain.quantity.Quantity`` — the plan side's amount axis, mirroring
    # ``LoggedSet.quantity`` on the record side. A ``repetitions`` kind carries the target
    # count; a ``distance`` or ``duration`` kind types a prescribed run or timed hold, so a
    # cardio Prescription is loggable through its own plan. The free-text ``reps`` above is
    # retained for display/back-compat; this typed Quantity is the source of truth for
    # rendering the log input. Additive and nullable: existing rows read ``None`` until the
    # backfill (0027) types them, and no write path is required to populate it yet.
    prescribed_quantity: dict | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # Typed Load (ADR-0010): a ``{kind, text, ...payload}`` value object, never a
    # bare string — so downstream analytics read the meaning instead of re-guessing
    # the free-text. See ``app.domain.load.ParsedLoad``.
    recommended_load: dict | None = Field(
        default=None, sa_column=Column(JSON, nullable=True)
    )
    # Superset grouping (ADR-0023) — both NULL for a flat, solo Prescription. Members
    # of one Superset share ``superset_group`` (an ordered, contiguous run) and carry
    # the group-owned ``round_rest_seconds`` (denormalized onto each member so it is
    # reorder-stable — the round-rest belongs to the group, not to whichever member
    # lands last). A grouped member's own ``rest_seconds`` goes dormant and returns
    # intact on ungroup. Additive and nullable: existing flat Protocols read unchanged.
    superset_group: str | None = Field(default=None)
    round_rest_seconds: int | None = Field(default=None)
    # Pinned rep target (ADR-0053, #369): a user-set bodyweight rep range that suspends
    # read-time Progression for this one Prescription. NULL is the default and means
    # automatic Progression governs the rep target; a non-NULL value (e.g. ``"10-14"``)
    # is the *user-set marker* the ``progress.py`` overlay surfaces verbatim, skipping
    # ``next_prescription`` for this movement until it is un-pinned (the column cleared).
    # Additive and nullable: every existing Prescription reads NULL and behaves exactly
    # as before. Only the user's own copy is ever written — never a shared/cached
    # Generated artifact (ADR-0003).
    pinned_reps: str | None = Field(default=None)


class LoggedSession(SQLModel, table=True):
    """The record of a user performing a Session on a date.

    This is the *record* side of the plan/record split: it references the
    prescribing ``WorkoutSession`` but never mutates it, and one Session may have
    many Logged Sessions (each a separate performance). It owns its ordered
    ``LoggedSet`` rows. Reads are scoped to ``clerk_user_id``."""

    __tablename__ = "logged_session"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    # The prescribing Session, or NULL for a plan-less record (ADR-0031). A record of
    # performed work is first-class whether or not a plan ever described it; a plan-less
    # log carries no Session id and so structurally cannot advance a Protocol.
    session_id: int | None = Field(
        default=None, foreign_key="workout_session.id", index=True
    )
    # This performance's training type (ADR-0031), always populated. A plan-backed
    # record copies it from its Session at log time; a plan-less record carries its own.
    # Denormalized onto the record so reads take it off the row, never joining back to a
    # parent that may not exist (the join-based ``_training_type`` helpers are retired).
    training_type: str
    performed_on: date
    # Completion Outcome (ADR-0013): ``completed`` | ``incomplete``, the client's
    # declared verdict on whether every prescribed set was attempted. Nullable — a
    # log that never declares one (a legacy after-the-fact record) leaves it unset,
    # and only an explicit ``incomplete`` holds the Session as the Next Session.
    completion_outcome: str | None = Field(default=None)
    # Session Duration (ADR-0014): whole seconds of actual training time, measured
    # start → last activity so idle gaps are excluded. Nullable and known only for a
    # live-tracked performance — a log recorded after the fact through the static
    # form never measures one and stays NULL.
    duration_seconds: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)


class LoggedSet(SQLModel, table=True):
    """One actual set the user performed within a Logged Session.

    Records the real ``quantity`` and ``load`` and the user's Performance Feedback as
    ``perceived_difficulty`` (an RPE-style 1–10 score, optional). References the
    catalog ``Exercise`` that was performed; ``position`` fixes display order."""

    __tablename__ = "logged_set"

    id: int | None = Field(default=None, primary_key=True)
    logged_session_id: int = Field(foreign_key="logged_session.id", index=True)
    exercise_id: int = Field(foreign_key="exercise.id", index=True)
    position: int
    # Typed Quantity (ADR-0032): a ``{kind, text, ...payload}`` value object matching
    # ``app.domain.quantity.Quantity`` — the set's amount axis. A ``repetitions`` kind
    # carries the rep count that used to live in a bare ``reps`` int; a distance or
    # duration kind carries a run or a hold. Nullable like ``load``, so a set with no
    # readable amount is stored as ``None`` rather than a fabricated zero.
    quantity: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    # Typed Load (ADR-0010): a ``{kind, text, ...payload}`` value object matching
    # ``app.domain.load.ParsedLoad``, so a logged bodyweight or %-1RM set carries
    # its meaning and is never silently dropped by a kg-only aggregate.
    load: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    perceived_difficulty: int | None = Field(default=None)
    # Performed Body Weight (ADR-0026): the performer's body mass at the moment this
    # set was logged, snapshotted from the Profile once at the write boundary so a
    # bodyweight set's strength estimate is fixed by what happened and never drifts.
    # NULL when no weight was on file — the set is left outside strength records, not
    # given a fabricated mass. Additive/nullable: sets logged before this stay NULL.
    body_weight_kg: float | None = Field(default=None)


class MetricEntry(SQLModel, table=True):
    """A user's body metric recorded at a point in time (Slice 12).

    This is the *time series* the Fitness Profile snapshot deliberately is not: the
    Profile's ``weight_kg`` (and similar) is a mutable "now", whereas a MetricEntry
    is an immutable dated reading — weight, body-fat, waist, etc. — kept so progress
    can be reviewed over time and never overwritten. ``metric`` names the quantity
    (e.g. ``"weight"``), ``value`` is its numeric reading, ``unit`` is free-form and
    optional (e.g. ``"kg"``), and ``recorded_on`` dates it. Reads are scoped to
    ``clerk_user_id``; the snapshot Profile is untouched by these rows."""

    __tablename__ = "metric_entry"

    id: int | None = Field(default=None, primary_key=True)
    clerk_user_id: str = Field(index=True)
    metric: str = Field(index=True)
    value: float
    unit: str | None = Field(default=None)
    recorded_on: date
    created_at: datetime = Field(default_factory=_utcnow)


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
