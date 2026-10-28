"""Load re-expression and the Prescribed Original for Substitution (ADR-0143).

Pure rules, no I/O. When a Substitution moves an Exercise Prescription onto a movement
that needs different equipment, its Load is **re-expressed**, never carried: a kg figure
is meaningless across equipment, and an AI-guessed weight has no record behind it. A
bodyweight movement gets a bodyweight Load; anything else gets a qualitative "pick a
challenging weight". A swap on the same equipment (a Variation, say) keeps the Load as it was.

The first Substitution snapshots the **Prescribed Original** — the Exercise, Load and
Progression Scheme the plan prescribed — on the user's own copy. Later Substitutions keep
that first snapshot, and **Restore** puts all three back exactly. While the snapshot is
held, a stored scheme the re-expressed Load no longer fits falls back to the default
(``None``, ADR-0064); Restore brings it back.

Both writes are expressed as a mapping of prescription-spine field changes, so the
repository applies them through the one field manifest (ADR-0069)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.equipment import missing_equipment
from app.domain.load import LoadKind, ParsedLoad
from app.domain.progression import parse_scheme, scheme_applies_to_optional_load

#: The qualitative Load a re-expressed movement on other equipment carries.
CHALLENGING_WEIGHT_TEXT = "pick a challenging weight"
_BODYWEIGHT_TEXT = "bodyweight"


@dataclass(frozen=True)
class PrescribedOriginal:
    """What an Exercise Prescription carried before its first Substitution.

    ``exercise_name`` is kept with the id so a read can say what Restore brings back
    without a second catalog lookup. Stored as a dict in the plan-side
    ``prescribed_original`` column; never carried into a copy of the plan."""

    exercise_id: int
    exercise_name: str
    recommended_load: dict | None
    scheme: str | None

    def to_dict(self) -> dict:
        return {
            "exercise_id": self.exercise_id,
            "exercise_name": self.exercise_name,
            "recommended_load": self.recommended_load,
            "scheme": self.scheme,
        }

    @classmethod
    def from_dict(cls, data: dict) -> PrescribedOriginal:
        return cls(
            exercise_id=data["exercise_id"],
            exercise_name=data["exercise_name"],
            recommended_load=data.get("recommended_load"),
            scheme=data.get("scheme"),
        )


@dataclass(frozen=True)
class PrescriptionState:
    """The parts of one Exercise Prescription a Substitution reads."""

    exercise_id: int
    exercise_name: str
    required_equipment: Sequence[str]
    recommended_load: dict | None
    scheme: str | None
    prescribed_original: dict | None


def _same_equipment(first: Sequence[str], second: Sequence[str]) -> bool:
    """Whether two equipment lists name the same equipment, read through the canonical
    vocabulary (ADR-0077): each covers the other, and bodyweight counts as no equipment."""

    return not missing_equipment(first, second) and not missing_equipment(second, first)


def re_express_load(
    load: dict | None,
    *,
    original_equipment: Sequence[str],
    target_equipment: Sequence[str],
) -> dict | None:
    """The Load the target movement carries after a Substitution (ADR-0143).

    Unchanged equipment keeps ``load``; a bodyweight target gets a bodyweight Load; any
    other target gets a qualitative Load. A Prescription with no Load stays without one."""

    if load is None or _same_equipment(original_equipment, target_equipment):
        return load
    if not missing_equipment(target_equipment, ()):
        return ParsedLoad(kind=LoadKind.BODYWEIGHT, text=_BODYWEIGHT_TEXT).to_dict()
    return ParsedLoad(kind=LoadKind.QUALITATIVE, text=CHALLENGING_WEIGHT_TEXT).to_dict()


def fitted_scheme(scheme: str | None, load: dict | None) -> str | None:
    """``scheme`` if it still applies to ``load``, else the default (``None``, ADR-0064).

    An unknown stored value is left as it is: it is not this rule's to repair."""

    if scheme is None:
        return None
    parsed_scheme = parse_scheme(scheme)
    if parsed_scheme is None:
        return scheme
    parsed_load = ParsedLoad.from_dict(load) if load is not None else None
    if scheme_applies_to_optional_load(parsed_scheme, parsed_load):
        return scheme
    return None


def substitution_changes(
    current: PrescriptionState,
    *,
    target_exercise_id: int,
    target_equipment: Sequence[str],
) -> dict[str, object]:
    """The spine field changes a Substitution to ``target_exercise_id`` writes.

    Swaps the Exercise, re-expresses the Load, fits the scheme to it, and snapshots the
    Prescribed Original unless one is already held. Every other field is kept."""

    load = re_express_load(
        current.recommended_load,
        original_equipment=current.required_equipment,
        target_equipment=target_equipment,
    )
    snapshot = current.prescribed_original or PrescribedOriginal(
        exercise_id=current.exercise_id,
        exercise_name=current.exercise_name,
        recommended_load=current.recommended_load,
        scheme=current.scheme,
    ).to_dict()
    return {
        "exercise_id": target_exercise_id,
        "recommended_load": load,
        "scheme": fitted_scheme(current.scheme, load),
        "prescribed_original": snapshot,
    }


def restore_changes(prescribed_original: dict) -> dict[str, object]:
    """The spine field changes Restore writes: the snapshot's Exercise, Load and scheme
    back exactly, and the snapshot cleared."""

    original = PrescribedOriginal.from_dict(prescribed_original)
    return {
        "exercise_id": original.exercise_id,
        "recommended_load": original.recommended_load,
        "scheme": original.scheme,
        "prescribed_original": None,
    }


__all__ = [
    "CHALLENGING_WEIGHT_TEXT",
    "PrescribedOriginal",
    "PrescriptionState",
    "fitted_scheme",
    "re_express_load",
    "restore_changes",
    "substitution_changes",
]
