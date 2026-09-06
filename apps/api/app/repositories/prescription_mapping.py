"""One home for the Exercise Prescription field spine (ADR-0069).

The prescription of one Exercise inside a Session carries a fixed set of plan
fields — the **spine**: the catalog-Exercise reference, sets, the free-text reps
line, rest, tempo, the typed Load, the typed Prescribed Quantity, the Superset
overlay, the chosen Progression Scheme, the Set Type, the Target Effort, and the
Exercise Note. That spine used to be hand-enumerated across ~17 backend sites —
the draft/view DTOs, both repository adapters' ORM builds, the Deploy path, the
generation map, and the JSON serializers — so adding one field was shotgun
surgery and a single omission silently dropped it. That is the class of bug that
once flattened a saved Superset on Start (``superset_group``/``round_rest_seconds``
missing from one hand-rolled dict — ADR-0023).

This module is the **single declaration** of the spine (``PrescriptionDraft``,
whose fields *are* the manifest) and the generic field-iteration mappers every
persistence site routes through:

- ``row_from_draft`` / ``draft_from_row`` build and read the ORM row;
- ``evolve_prescription_row`` rewrites one spine field of a row without
  re-listing the other twelve — the copy-with-one-change pattern (Substitution,
  scheme selection) that used to re-type every field by hand;
- ``view_from_row`` layers the joined catalog Exercise on top of the spine for
  reads.

Deliberately **not** centralised here (ADR-0069): the LLM output schema
(``generation/schema.py`` — a trust boundary, ADR-0006) and the wire DTO
(``routes/sessions.py``, which validates and parses raw input) keep their own
explicit field lists, and the two JSON projections
(``session_serialization.serialize_prescription`` and ``export/serializer``) stay
explicit dicts. Each differs from the spine on purpose — a rename across the
model boundary, input validation, a denormalised catalog join, a catalog-by-id
reference. A completeness guard (``tests/test_prescription_spine.py``), never
code generation, is what keeps those honest: it fails if a projection or the
generation partition forgets a spine field.
"""

from __future__ import annotations

from dataclasses import dataclass, fields, replace

from app.db.models import Exercise, ExercisePrescription


@dataclass(frozen=True)
class PrescriptionDraft:
    """One Exercise Prescription to persist, referencing a catalog Exercise.

    The canonical **spine**: its fields are the one manifest every persistence
    mapper iterates (ADR-0069). ``position``/``session_id``/``id`` are not spine
    fields — they are structural, assigned by the repository at persist time.

    ``superset_group``/``round_rest_seconds`` overlay Supersets (ADR-0023): both
    ``None`` for a flat, solo Prescription; members of one Superset share the group
    tag and carry the group-owned round-rest denormalized onto each member."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: dict | None = None
    # Typed Prescribed Quantity (ADR-0050): a stored ``Quantity`` dict, ``None`` for a
    # prescription that carries no typed amount yet. Additive and carried through create,
    # Duplicate, and Regeneration so a backfilled cardio target survives a copy.
    prescribed_quantity: dict | None = None
    superset_group: str | None = None
    round_rest_seconds: int | None = None
    # Progression Scheme selection (ADR-0064, #429): the chosen ``ProgressionScheme``
    # value, or ``None`` for the default (Double Progression). Carried through
    # create/Duplicate/Regeneration-keep like the other prescription fields so a chosen
    # scheme survives a copy of the user's own plan.
    scheme: str | None = None
    # Set Type annotation (ADR-0065, #449): the chosen ``SetType`` value, or ``None`` for
    # "unset" — which reads as ``working``. A descriptive plan property (never a
    # Progression input) carried through create/Duplicate/Redeem/Share/Substitution like
    # the other prescription fields, so a tagged movement survives a copy of the plan.
    set_type: str | None = None
    # Target Effort (ADR-0066, #454): the *prescribed* Effort dict ("aim for RPE 8"), or ``None``
    # for "no target". A descriptive plan property (never a Progression input) carried through
    # create/Duplicate/Redeem/Share/Substitution like the other prescription fields, so a targeted
    # movement survives a copy of the plan; left unset by Capture.
    target_effort: dict | None = None
    # Exercise Note (ADR-0065, #451): the plan-side coaching cue, or ``None`` for "no note".
    # Already length-capped and HTML-escaped at the write boundary (``app.domain.note``); a
    # plan property carried through create/Duplicate/Redeem/Share/Substitution like the other
    # prescription fields, so a movement's cue survives a copy of the plan.
    note: str | None = None


@dataclass(frozen=True)
class PrescriptionView:
    """A prescription joined to its catalog Exercise, ready to serialize.

    The spine (read straight off the persisted row) plus the denormalized catalog
    Exercise fields the API read layers on top — the join that the Export
    projection deliberately omits (it emits the catalog once, by id)."""

    position: int
    sets: int
    reps: str
    rest_seconds: int | None
    tempo: str | None
    recommended_load: dict | None
    # Typed Prescribed Quantity (ADR-0050): the stored ``Quantity`` dict, ``None`` when the
    # prescription has no typed amount. Surfaced on the read so the session-detail response
    # carries it to the web client.
    prescribed_quantity: dict | None
    superset_group: str | None
    round_rest_seconds: int | None
    exercise_id: int
    exercise_name: str
    exercise_description: str | None
    targeted_muscles: list[str]
    required_equipment: list[str]
    provenance: str
    # Progression Scheme selection (ADR-0064, #429): the chosen ``ProgressionScheme``
    # value, or ``None`` for "no choice" — which the read-time Progression overlay
    # resolves to the default (Double Progression). Defaulted so the many call sites that
    # build a view without a scheme keep reading unchanged as the un-chosen default.
    scheme: str | None = None
    # Set Type annotation (ADR-0065, #449): the chosen ``SetType`` value, or ``None`` for
    # "unset" — which the frontend view-model resolves to no badge (a neutral working set).
    # Surfaced on the read so the session-detail response carries the tag to the web client.
    # Defaulted so the many call sites that build a view without one read as unset.
    set_type: str | None = None
    # Target Effort (ADR-0066, #454): the *prescribed* Effort dict, or ``None`` for "no target" —
    # which the frontend renders as nothing. Surfaced on the read so the session-detail response
    # carries the target to the web client, where it is shown/edited with an RPE⇄RIR projection.
    # Defaulted so the many call sites that build a view without one read as no target.
    target_effort: dict | None = None
    # Exercise Note (ADR-0065, #451): the plan-side coaching cue, or ``None`` for "no note" —
    # which the frontend renders as nothing. The stored value is already HTML-escaped at the
    # write boundary. Surfaced on the read so the session-detail response carries it to the web
    # client. Defaulted so the many call sites that build a view without one read as no note.
    note: str | None = None


def prescription_spine_fields() -> tuple[str, ...]:
    """The names of the spine fields, in declaration order — the one manifest.

    Derived from ``PrescriptionDraft`` itself so the dataclass *is* the single
    source of truth: adding a field to the dataclass extends every mapper and the
    completeness guard at once, with no parallel list to keep in step."""

    return tuple(f.name for f in fields(PrescriptionDraft))


# The spine partitioned by authorship (ADR-0069). AI generation
# (``generation/prescriptions.resolve_prescriptions``) fills only the AI-authored
# fields from the LLM schema, across the trust boundary and with renames
# (``typed_load`` → ``recommended_load``); the user-authored fields are chosen as
# plan edits and default to ``None`` on a generated draft. The completeness guard
# asserts ``AI_AUTHORED_FIELDS | USER_AUTHORED_FIELDS == set(spine)``, so a new
# field cannot be added without a conscious "does the AI author this?" decision.
AI_AUTHORED_FIELDS: frozenset[str] = frozenset(
    {
        "exercise_id",
        "sets",
        "reps",
        "rest_seconds",
        "tempo",
        "recommended_load",
        "prescribed_quantity",
        "superset_group",
        "round_rest_seconds",
    }
)
USER_AUTHORED_FIELDS: frozenset[str] = frozenset(
    {"scheme", "set_type", "target_effort", "note"}
)


def row_from_draft(
    draft: PrescriptionDraft, *, session_id: int, position: int
) -> ExercisePrescription:
    """Build one persistable row at ``position`` from a draft (ADR-0069).

    The single draft→ORM mapping the full-list create, the single-row Insert
    append, and both Protocol adapters' create/Deploy builds all route through, so
    every spine field lands automatically. ``session_id``/``position`` are the
    structural fields the repository assigns; ``id`` is left to the database."""

    return ExercisePrescription(
        session_id=session_id,
        position=position,
        **{name: getattr(draft, name) for name in prescription_spine_fields()},
    )


def draft_from_row(row: ExercisePrescription) -> PrescriptionDraft:
    """Read one persisted row back into a draft (ADR-0069) — the inverse of
    :func:`row_from_draft`, used to copy prescriptions (Duplicate, Redeem) and to
    recompute the surviving/kept set on Regeneration and Remove."""

    return PrescriptionDraft(
        **{name: getattr(row, name) for name in prescription_spine_fields()}
    )


def evolve_prescription_row(
    row: ExercisePrescription, **changes: object
) -> ExercisePrescription:
    """A copy of ``row`` with ``changes`` applied to named spine fields (ADR-0069).

    The copy-with-one-change primitive behind the in-memory Substitution and
    scheme-selection rebuilds, which used to re-type all thirteen spine fields to
    change one — the exact shape that silently drops a newly added field.
    ``id``/``session_id``/``position`` are carried forward unchanged; every spine
    field flows through :func:`draft_from_row`/:func:`row_from_draft`, so only the
    named ``changes`` differ. ``dataclasses.replace`` rejects any key that is not a
    spine field, so a typo cannot silently no-op."""

    evolved = replace(draft_from_row(row), **changes)
    new = row_from_draft(evolved, session_id=row.session_id, position=row.position)
    new.id = row.id
    return new


def view_from_row(
    row: ExercisePrescription, exercise: Exercise
) -> PrescriptionView:
    """Join one persisted row to its catalog Exercise for a read (ADR-0069).

    The spine is read straight off the row; the catalog fields
    (name/description/muscles/equipment/provenance) come from the joined
    ``Exercise``. Shared by both repository adapters' reads so a Session and a
    Protocol member render an identical Prescription shape."""

    spine = {
        name: getattr(row, name)
        for name in prescription_spine_fields()
        if name != "exercise_id"
    }
    return PrescriptionView(
        position=row.position,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        exercise_description=exercise.description,
        targeted_muscles=list(exercise.targeted_muscles),
        required_equipment=list(exercise.required_equipment),
        provenance=exercise.provenance,
        **spine,
    )


__all__ = [
    "PrescriptionDraft",
    "PrescriptionView",
    "prescription_spine_fields",
    "AI_AUTHORED_FIELDS",
    "USER_AUTHORED_FIELDS",
    "row_from_draft",
    "draft_from_row",
    "evolve_prescription_row",
    "view_from_row",
]
