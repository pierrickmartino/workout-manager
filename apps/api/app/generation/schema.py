"""Structured-output schema for AI generation (ADR-0006).

These Pydantic models are the strict JSON schema Claude is constrained to emit;
they map directly onto the domain types — a ``GeneratedSession`` of
``GeneratedExercisePrescription`` rows, each carrying the catalog-Exercise shape
(name, description, muscles, equipment) alongside the prescription (sets, reps,
rest, tempo, recommended load). Validating against these models at the boundary
turns "did the AI return well-formed data?" into a guarantee."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.json_schema import SkipJsonSchema

from app.domain.load import parse_load
from app.domain.quantity import quantity_from_input, quantity_from_text

# Operator lineage stamped on an artifact *after* validation (#274): the generation
# call's trace id. ``SkipJsonSchema`` keeps it out of the JSON schema the model is
# constrained to — the model is never asked to produce it — while leaving it a normal
# serialized field, so it survives the cache's ``model_dump_json`` round-trip and is
# restored on a cache hit. Absent (``None``) when no recorder is configured.
TraceId = SkipJsonSchema[str | None]


class GeneratedQuantity(BaseModel):
    """The typed Prescribed Quantity the model declares directly (ADR-0050, #344).

    The plan-side sibling of ``recommended_load``: where that names the free-text
    load, this names the amount axis up front — a ``kind`` (``repetitions`` /
    ``distance`` / ``duration``), the ``value`` for that kind, a distance ``unit``
    (``km`` / ``mi``), and an optional companion ``duration`` (a ``mm:ss`` run time
    from which pace becomes derivable). It maps exactly onto
    :func:`quantity_from_input`, the write-boundary builder the log form already
    feeds, so generation and the picker share one canonicalisation.

    ``kind`` is a plain string, not an enum, on purpose: an out-of-vocabulary kind
    must degrade through the shared text-inference fallback at the
    :attr:`GeneratedExercisePrescription.typed_quantity` boundary, never fail the
    whole generation. ``coerce_numbers_to_str`` tolerates a model that emits a bare
    number for ``value`` instead of a string."""

    model_config = ConfigDict(coerce_numbers_to_str=True)

    kind: str
    value: str
    unit: str | None = None
    duration: str | None = None


class GeneratedExercisePrescription(BaseModel):
    """One prescribed Exercise: the catalog definition plus its prescription.

    The AI emits ``recommended_load`` as the free-text load vocabulary it is fluent
    in (``"70kg"``, ``"bodyweight"``, ``"70% 1RM"``). ``typed_load`` is the
    generation-ingestion boundary (ADR-0010): it runs :func:`parse_load` once so
    everything downstream persists and reads a typed ``{kind, text, ...}`` Load
    instead of re-guessing the string forever. ``typed_quantity`` is the analogous
    boundary for the amount axis (ADR-0050)."""

    exercise_name: str
    exercise_description: str | None = None
    targeted_muscles: list[str] = Field(default_factory=list)
    required_equipment: list[str] = Field(default_factory=list)
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: str | None = None
    # Typed Prescribed Quantity (ADR-0050): the model declares the amount's kind +
    # value directly. ``None`` when the model emits only the free-text ``reps`` amount
    # (a legacy/bare generation) — ``typed_quantity`` then infers the kind from that
    # prose via the shared #341 fallback, so the prescription is always born typed.
    quantity: GeneratedQuantity | None = None
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

    @property
    def typed_quantity(self) -> dict:
        """The prescription's typed Prescribed Quantity as a stored ``Quantity`` dict.

        The plan-side sibling of :attr:`typed_load`. When the model declares a typed
        ``quantity`` (kind + value), it is built once through the shared write-boundary
        builder :func:`quantity_from_input` — the same path the log form's kind picker
        feeds. When the model emits only a bare free-text ``reps`` amount, or a
        kind/value the builder can't type (an unrecognised kind, a blank value), it
        falls through to :func:`quantity_from_text` (#341) — the same inference the
        one-time backfill uses. Either way a typed Quantity is produced, so a malformed
        generation degrades gracefully instead of leaving the prescription untyped."""

        if self.quantity is not None:
            built = quantity_from_input(
                self.quantity.kind,
                self.quantity.value,
                unit=self.quantity.unit or "km",
                duration=self.quantity.duration,
            )
            if built is not None:
                return built.to_dict()
        return quantity_from_text(self.reps).to_dict()


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


class GeneratedEnrichment(BaseModel):
    """The AI's fill for one *existing* Stub catalog Exercise (ADR-0041).

    The enrichment backfill (issue #308) feeds the model a name-only movement and
    asks it to supply the fields that lift a Stub to at least **Listable**: a
    description, the flat ``targeted_muscles`` union, ordered Execution Steps, and a
    1–10 difficulty. It deliberately produces **no precautions and no image** — a
    fabricated safety note or a wrong illustration is actively dangerous, so both
    stay curator-only — and **no Primary/Secondary split**, which is Enriched-tier
    and would pressure invented primacy (ADR-0016). Malformed output is rejected at
    the ``generate_structured`` boundary and nothing is written."""

    description: str | None = None
    # ``instructions`` is an ordered list of Execution Steps (ADR-0015): one entry
    # per discrete step, in performance order — never a prose blob re-guessed on
    # every read.
    instructions: list[str] = Field(default_factory=list)
    difficulty: int | None = None
    # The flat, durable union the F3 Muscle Group roll-up reads (ADR-0011). The pass
    # never writes a Primary/Secondary split — that stays Enriched-tier.
    targeted_muscles: list[str] = Field(default_factory=list)


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
