"""The request body for one Exercise Prescription of a plan (ADR-0010, ADR-0069).

Every route that takes a Prescription from the client parses it through one of these two
bodies, so "what a valid Prescription looks like on the wire" is one rule:

- ``AuthorPrescriptionBody`` — a Hand-Authored Session's Prescription, and the Insert of
  one into a standalone Session. It carries no Progression Scheme: a standalone Session's
  scheme is chosen in place (ADR-0064).
- ``EditPrescriptionBody`` — the author fields plus the carried scheme, for an Edit of a
  standalone Session's plan (ADR-0133) and for each Prescription of a Deploy (ADR-0020).

The body is the wire DTO ADR-0069 keeps *outside* the storage spine: it validates and parses
raw client input (a Load kind + value, a Quantity pick, an Effort scale + value, a raw note)
into the typed values the spine stores, then hands back a ``PrescriptionDraft``.
"""

from __future__ import annotations

from dataclasses import replace

from pydantic import BaseModel, field_validator, model_validator

from app.domain.effort import EffortScale, effort_from_input
from app.domain.load import LoadKind, load_from_input
from app.domain.note import parse_note
from app.domain.progression import ProgressionScheme, parse_scheme
from app.domain.quantity import QuantityKind, prescribed_quantity_from_input
from app.domain.set_type import SetType, parse_set_type
from app.repositories.prescription_mapping import PrescriptionDraft

DEFAULT_LOAD_KIND = "absolute"


class AuthorPrescriptionBody(BaseModel):
    """One authored Exercise Prescription — the *plan* side of a Hand-Authored Session.

    Carries the sets/reps/rest/tempo and a typed Load (ADR-0010): ``load_kind`` is the
    kind the user picked and ``load_value`` its value field (a number for ``absolute`` /
    ``percent_1rm``, a ``low-high`` pair for ``range``, added kilograms for
    ``bodyweight``, free text for ``qualitative``). ``superset_group`` /
    ``round_rest_seconds`` overlay Supersets (ADR-0023, issue #289): both ``None`` for a
    flat, solo Prescription; members of one Superset share the group tag and carry the
    group-owned round-rest. The grouping is validated through the Builder's
    ``validate_deploy`` rules in the service, so a non-contiguous or singleton "superset"
    is rejected whole with nothing persisted.

    ``quantity_kind`` / ``quantity_unit`` carry the amount picker's choice (ADR-0050,
    issue #345): the kind the user picked for this exercise (``repetitions`` / ``distance``
    / ``duration``) and, for a distance, its unit. They type the plan's Prescribed Quantity
    at the write boundary so a "Distance / 5 km" the user authored is *saved* a distance
    rather than dropped to a free-text target that loses its input on reuse. Both are
    optional: an older client that omits them still types the plan by inferring the kind
    from the free-text ``reps`` target, exactly as the backfill migration does."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    load_kind: str = DEFAULT_LOAD_KIND
    load_value: str | None = None
    quantity_kind: str | None = None
    quantity_unit: str | None = None
    superset_group: str | None = None
    round_rest_seconds: int | None = None
    # Set Type annotation (ADR-0065, #449): a chosen ``SetType`` value, or ``None``/blank
    # for "unset" (reads as working). Descriptive only — echoed back on the Prescription,
    # never a Progression input. Membership is checked at the boundary and never coerced.
    set_type: str | None = None
    # Target Effort (ADR-0066, #454): the *prescribed* Effort on this movement, logged in
    # *either* scale — ``target_effort_scale`` is the picked scale (``rpe`` / ``rir``) and
    # ``target_effort_value`` its number. Both absent means no target ("aim as you like"); a
    # present value with no scale defaults to RPE. The value is validated against its scale's
    # band at the boundary (below) and rejected (422) if invalid — never coerced. Descriptive in
    # v1: it feeds the Scheme Preview and the UI but is never a Progression input.
    target_effort_scale: str | None = None
    target_effort_value: float | None = None
    # Exercise Note (ADR-0065, #451): an optional plan-side coaching cue, or ``None``/blank for
    # "no note". Sanitized at the boundary by ``parse_note`` (below): blank → unset, over-cap →
    # 422, else stripped + HTML-escaped so the stored value is inert wherever it renders.
    note: str | None = None

    @field_validator("load_kind")
    @classmethod
    def _known_load_kind(cls, value: str) -> str:
        try:
            LoadKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in LoadKind)
            raise ValueError(f"load_kind must be one of: {allowed}") from exc
        return value

    @field_validator("quantity_kind")
    @classmethod
    def _known_quantity_kind(cls, value: str | None) -> str | None:
        # A blank/absent pick is tolerated — the free-text target's prose is inferred
        # instead; an explicit but unknown kind is a client bug, rejected at the boundary.
        if value is None or value == "":
            return value
        try:
            QuantityKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in QuantityKind)
            raise ValueError(f"quantity_kind must be one of: {allowed}") from exc
        return value

    @field_validator("set_type")
    @classmethod
    def _known_set_type(cls, value: str | None) -> str | None:
        # A blank/absent Set Type is "unset" and normalizes to ``None`` (reads as working);
        # a present but unknown value is a client bug rejected at the boundary, never coerced.
        if value is None or value == "":
            return None
        if parse_set_type(value) is None:
            allowed = ", ".join(member.value for member in SetType)
            raise ValueError(f"set_type must be one of: {allowed}")
        return value

    @field_validator("note")
    @classmethod
    def _sanitize_note(cls, value: str | None) -> str | None:
        # Sanitize the Exercise Note at the write boundary (ADR-0065): blank → unset (None),
        # over-cap → 422 (``NoteTooLongError`` is a ``ValueError``), else stripped + HTML-escaped
        # so it is inert wherever it renders (nonce-CSP DOM-XSS posture, ADR-0036). Escaping here
        # (not on copy) keeps carry-forward from double-escaping a note that is copied verbatim.
        return parse_note(value)

    @field_validator("target_effort_scale")
    @classmethod
    def _known_target_effort_scale(cls, value: str | None) -> str | None:
        # A blank/absent scale normalizes to ``None`` (an RPE target can be set with no explicit
        # scale); a present but unknown scale is rejected at the boundary.
        if value is None or value == "":
            return None
        if value not in (scale.value for scale in EffortScale):
            allowed = ", ".join(scale.value for scale in EffortScale)
            raise ValueError(f"target_effort_scale must be one of: {allowed}")
        return value

    @model_validator(mode="after")
    def _valid_target_effort(self) -> "AuthorPrescriptionBody":
        # Validate the scale+value combination once, so an out-of-band target (RPE 11, RIR 2.5,
        # a non-half-step) is rejected (422) at the boundary rather than stored as a number whose
        # meaning was guessed. A blank value is no target and passes.
        try:
            effort_from_input(self.target_effort_scale, self.target_effort_value)
        except ValueError as exc:
            raise ValueError(f"target_effort: {exc}") from exc
        return self

    def to_draft(self) -> PrescriptionDraft:
        parsed = load_from_input(self.load_kind, self.load_value)
        # Type the plan's Prescribed Quantity at the write boundary (ADR-0050): the picked
        # kind is authoritative, falling back to inference over the free-text target when the
        # pick is absent or can't type the target — the same shared primitive generation and
        # the backfill use, so an authored plan is born typed like any other.
        prescribed_quantity = prescribed_quantity_from_input(
            self.quantity_kind,
            self.reps,
            unit=self.quantity_unit or "km",
        )
        return PrescriptionDraft(
            exercise_id=self.exercise_id,
            sets=self.sets,
            reps=self.reps,
            rest_seconds=self.rest_seconds,
            tempo=self.tempo,
            recommended_load=parsed.to_dict() if parsed is not None else None,
            prescribed_quantity=prescribed_quantity.to_dict(),
            superset_group=self.superset_group,
            round_rest_seconds=self.round_rest_seconds,
            set_type=self.set_type,
            target_effort=self._resolved_target_effort(),
            note=self.note,
        )

    def _resolved_target_effort(self) -> dict | None:
        # The typed Target Effort dict for storage, or ``None`` when no target was set — the
        # plan-side counterpart of ``resolved_load``. Already validated by ``_valid_target_effort``.
        effort = effort_from_input(self.target_effort_scale, self.target_effort_value)
        return effort.to_dict() if effort is not None else None


class EditPrescriptionBody(AuthorPrescriptionBody):
    """One prescription of an edited plan (Edit, ADR-0133): an authored prescription plus
    the movement's carried Progression Scheme, which the editor round-trips untouched so an
    edit never silently resets a chosen scheme.

    The same body is one Prescription of a Protocol's desired un-performed tail on Deploy
    (ADR-0020): both are edits of a plan. The scheme's membership is checked here; its
    Load-kind *compatibility* is the deploy gate's job (``validate_deploy``), so a mismatch
    surfaces as a located, retry-able ``incompatible_scheme`` rather than a 422 body error.
    On a standalone Session's Edit, a scheme the edited Load no longer fits falls back to
    the default in the service instead."""

    scheme: str | None = None

    @field_validator("scheme")
    @classmethod
    def _known_scheme(cls, value: str | None) -> str | None:
        # A blank/absent selection is the inherited default and normalizes to ``None``; a
        # present but unknown value is a client bug rejected at the boundary. Compatibility
        # with this movement's Load is checked later, on the deploy gate.
        if value is None or value == "":
            return None
        if parse_scheme(value) is None:
            allowed = ", ".join(scheme.value for scheme in ProgressionScheme)
            raise ValueError(f"scheme must be one of: {allowed}")
        return value

    def to_draft(self) -> PrescriptionDraft:
        return replace(super().to_draft(), scheme=self.scheme)


__all__ = ["DEFAULT_LOAD_KIND", "AuthorPrescriptionBody", "EditPrescriptionBody"]
