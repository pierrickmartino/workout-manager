"""Structured-output schema for AI generation (ADR-0006).

These Pydantic models are the strict JSON schema Claude is constrained to emit;
they map directly onto the domain types — a ``GeneratedSession`` of
``GeneratedExercisePrescription`` rows, each carrying the catalog-Exercise shape
(name, description, muscles, equipment) alongside the prescription (sets, reps,
rest, tempo, recommended load). Validating against these models at the boundary
turns "did the AI return well-formed data?" into a guarantee."""

from __future__ import annotations

from pydantic import BaseModel, Field
from pydantic.json_schema import SkipJsonSchema

from app.domain.load import parse_load

# Operator lineage stamped on an artifact *after* validation (#274): the generation
# call's trace id. ``SkipJsonSchema`` keeps it out of the JSON schema the model is
# constrained to — the model is never asked to produce it — while leaving it a normal
# serialized field, so it survives the cache's ``model_dump_json`` round-trip and is
# restored on a cache hit. Absent (``None``) when no recorder is configured.
TraceId = SkipJsonSchema[str | None]


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
    # Superset grouping (ADR-0023): both ``None`` for a flat, solo Prescription.
    # Members of one generated Superset share ``superset_group`` and each carries the
    # group-owned ``round_rest_seconds`` (denormalized per member so it survives
    # reorder). The parse boundary validates each group against the shared Superset
    # validator and degrades an invalid group to flat; grouping lives in the output,
    # not the request, so the coarse cache key (ADR-0003) is unchanged.
    superset_group: str | None = None
    round_rest_seconds: int | None = None

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
    it is rejected at the boundary as a schema violation.

    ``trace_id`` is operator lineage, not model output (#274): the generation call's
    trace id, stamped onto the artifact *after* validation so feedback on the resulting
    Session can trace back to the exact call. It is ``SkipJsonSchema`` — never part of the
    schema the model is constrained to — and absent when no recorder is configured."""

    prescriptions: list[GeneratedExercisePrescription] = Field(min_length=1)
    trace_id: TraceId = None


class GeneratedSubstitute(BaseModel):
    """The AI's output for a single substitute Exercise (Slice 11 fallback).

    Used only when no catalog Variation/Alternative fits the user's equipment and
    constraints. It carries the full enriched catalog shape so the new movement
    enters the catalog complete — stored once, as ``ai_generated``, for everyone."""

    exercise_name: str
    exercise_description: str | None = None
    # Execution Steps (ADR-0015): an ordered list, one entry per discrete step, so
    # the invented movement enters the catalog with genuine numbered steps rather
    # than a prose blob re-guessed on every read.
    instructions: list[str] = Field(default_factory=list)
    difficulty: int | None = None
    # ``targeted_muscles`` stays the flat, durable union the F3 Muscle Group roll-up
    # reads. ``primary_muscles`` / ``secondary_muscles`` are the Primary/Secondary
    # emphasis annotation layered on top (ADR-0016) — populated only when the model
    # actually asserts a split, never fabricated from the flat list.
    targeted_muscles: list[str] = Field(default_factory=list)
    primary_muscles: list[str] = Field(default_factory=list)
    secondary_muscles: list[str] = Field(default_factory=list)
    required_equipment: list[str] = Field(default_factory=list)
    precautions: list[str] = Field(default_factory=list)


class GeneratedMuscleEmphasis(BaseModel):
    """The AI's Primary/Secondary split for one *existing* catalog Exercise (issue #107).

    The re-enrichment pass (ADR-0016) feeds the model an Exercise's flat
    ``targeted_muscles`` union and asks it to classify those same muscles into prime
    movers and assisting muscles. Only the split is returned: ``targeted_muscles`` is
    the durable analytics-facing field and is never rewritten by the pass, so the F3
    Muscle Group roll-up is unaffected. An empty split means "no asserted primacy"."""

    primary_muscles: list[str] = Field(default_factory=list)
    secondary_muscles: list[str] = Field(default_factory=list)


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
    for. Adoption deep-copies it into a user-owned, mutable Protocol.

    ``trace_id`` is operator lineage stamped after validation (#274): the generation
    call's trace id, carried through the cache round-trip and onto the adopted Protocol so
    feedback can trace back to the originating call. ``SkipJsonSchema`` (never asked of the
    model); absent when no recorder is configured."""

    sessions: list[GeneratedProtocolSession] = Field(min_length=1)
    trace_id: TraceId = None
