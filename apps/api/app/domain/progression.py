"""Progression — the deterministic, no-AI Prescription adjustment (ADR-0004/0026).

``next_prescription`` is a pure function: given an Exercise Prescription and the
Logged Sets the user actually performed, it returns the adjusted Prescription for
the *upcoming* Prescriptions of that Exercise. It costs no AI call and reads nothing
external, so a cached/Generated artifact is never touched — only the user's own
copy moves. (``next_load`` is the load-only view of the same rule, kept for callers
that overlay just the load.)

The rule is a fixed-increment double-progression driven by one signal — every set
at the top of the prescribed rep range at low perceived effort is strong, any set
below the bottom is a miss — but *what* it steps depends on the Load kind (ADR-0026):

- **Absolute** (external weight): step the recommended kilograms — up by
  ``INCREASE_KG`` on strong performance, down by ``DECREASE_KG`` on a miss.
- **Bodyweight + added load**: step the *added* kilograms with the same increments;
  a reduction that reaches zero collapses back to a bare ``"bodyweight"`` movement.
- **Pure bodyweight** (nothing to add): step the *rep target* instead — raise its
  floor one rep toward the ceiling on strong performance; at the ceiling, where reps
  can grow no further, raise a ``suggest_harder_variation`` signal rather than growing
  reps unbound. The movement is never swapped here — that stays a user-initiated
  Substitution; the signal is only an offer.

Loads are free-text (``"60 kg"``, ``"bodyweight + 10 kg"``, ``"70% 1RM"``); a
%-1RM, range, or qualitative load — anything with no single clean value to move — is
left untouched rather than mangled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from app.domain.load import LoadKind, parse_load

# A fixed-increment step keeps the rule simple and auditable (vs. percentage math
# on noisy free-text loads). Reductions are larger than increases: backing off
# after missed reps is the cautious direction for a fitness app.
INCREASE_KG = 2.5
DECREASE_KG = 5.0

# Perceived difficulty is an RPE-style 1–10 score; at or below this the effort is
# "low" enough to justify adding load. Above it, the set counts as hard and the
# load only holds.
LOW_EFFORT_MAX = 7

_LOAD_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)(.*)$", re.DOTALL)
_RANGE_REPS_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")
_SINGLE_REPS_RE = re.compile(r"^\s*(\d+)\s*$")


class _Prescription(Protocol):
    reps: str
    recommended_load: str | None


class _LoggedSet(Protocol):
    reps: int
    perceived_difficulty: int | None


def _parse_load(load: str) -> tuple[float, str] | None:
    """Split a load into its leading numeric value and trailing unit/suffix.

    Returns ``None`` when there is no single clean number to move — no leading
    number (``"bodyweight"``) or a suffix that itself contains digits (a range
    like ``"70-80 kg"`` or ``"70% 1RM"``), which we refuse to guess at.
    """

    match = _LOAD_RE.match(load)
    if match is None:
        return None
    suffix = match.group(2)
    if any(character.isdigit() for character in suffix):
        return None
    return float(match.group(1)), suffix


def _parse_rep_target(reps: str) -> tuple[int, int] | None:
    """Parse the prescribed reps into a ``(floor, ceiling)`` target.

    A single number (``"5"``) yields ``(5, 5)``; a range (``"8-12"``) yields
    ``(8, 12)``. Free-text targets like ``"AMRAP"`` return ``None``.
    """

    range_match = _RANGE_REPS_RE.match(reps)
    if range_match is not None:
        return int(range_match.group(1)), int(range_match.group(2))
    single_match = _SINGLE_REPS_RE.match(reps)
    if single_match is not None:
        value = int(single_match.group(1))
        return value, value
    return None


def _format_load(value: float, suffix: str) -> str:
    number = int(value) if value == int(value) else value
    return f"{number}{suffix}"


class ProgressionKind(str, Enum):
    """What kind of adjustment Progression made to a Prescription's next outing.

    The four outcomes are mutually exclusive: a load moved (``LOAD_STEP``), the
    added weight on a bodyweight movement moved (``ADDED_LOAD_STEP``), the rep
    target on a pure-bodyweight movement moved (``REPS_STEP``), or nothing moved
    (``HOLD``). A step covers both directions — a strong-performance increase and a
    missed-reps decrease are both a step of their kind.
    """

    LOAD_STEP = "load_step"
    ADDED_LOAD_STEP = "added_load_step"
    REPS_STEP = "reps_step"
    HOLD = "hold"


@dataclass(frozen=True)
class NextPrescription:
    """The adjusted Prescription state for its next outing, tagged by what moved.

    ``reps`` and ``recommended_load`` carry the resulting values — equal to the
    inputs when ``kind`` is ``HOLD`` — so a caller can apply the result uniformly
    without re-deriving which field changed.

    ``suggest_harder_variation`` is an orthogonal signal, not a fifth ``kind``: a
    pure-bodyweight movement that has reached the top of its rep range and is still
    hitting it easily has nothing left to step (reps never grow unbounded, ADR-0026),
    so instead of stalling it *offers* a harder Variation. The prescription itself
    still holds — the movement is never auto-swapped; the swap stays a user-initiated
    Substitution — so ``kind`` remains ``HOLD`` when this fires.
    """

    kind: ProgressionKind
    reps: str
    recommended_load: str | None
    suggest_harder_variation: bool = False


def next_prescription(
    prescription: _Prescription, logged_sets: list[_LoggedSet]
) -> NextPrescription:
    """Return the deterministically adjusted Prescription for its next outing.

    Reads only the user's Logged Sets (reps + perceived effort) and never touches a
    shared/cached artifact. Holds unchanged when there is nothing to act on — no
    Logged Sets, an unparseable rep target, or a load with no clean numeric value.
    For an external-weight load, strong performance (every set at the rep ceiling,
    all at low perceived effort) steps the load up and missed reps step it down.
    """

    current = prescription.recommended_load
    reps = prescription.reps
    if not logged_sets or current is None:
        return NextPrescription(ProgressionKind.HOLD, reps, current)

    target = _parse_rep_target(reps)
    if target is None:
        return NextPrescription(ProgressionKind.HOLD, reps, current)
    floor, ceiling = target

    # The typed Load fixes the meaning once (ADR-0010): a bodyweight movement steps
    # its added weight (or, pure, its reps) rather than the kg the absolute path moves.
    load = parse_load(current)
    if load.kind is LoadKind.BODYWEIGHT:
        return _next_bodyweight(
            reps, current, load.added_kg, floor, ceiling, logged_sets
        )

    parsed = _parse_load(current)
    if parsed is None:
        return NextPrescription(ProgressionKind.HOLD, reps, current)
    value, suffix = parsed

    # Missed reps take precedence: backing off is the cautious direction, so it is
    # decided before any increase even if effort happened to read as low.
    if any(logged.reps < floor for logged in logged_sets):
        stepped = _format_load(max(value - DECREASE_KG, 0.0), suffix)
        return NextPrescription(ProgressionKind.LOAD_STEP, reps, stepped)

    if _hit_ceiling(logged_sets, ceiling) and _low_effort(logged_sets):
        stepped = _format_load(value + INCREASE_KG, suffix)
        return NextPrescription(ProgressionKind.LOAD_STEP, reps, stepped)

    return NextPrescription(ProgressionKind.HOLD, reps, current)


def _next_bodyweight(
    reps: str,
    current: str,
    added_kg: float | None,
    floor: int,
    ceiling: int,
    logged_sets: list[_LoggedSet],
) -> NextPrescription:
    """Progress a bodyweight Prescription (ADR-0026).

    With added load, the extra kilograms step exactly like an absolute load — up on
    strong performance, down on a miss. Pure bodyweight — no weight to add — has no
    kilograms to move, so it steps the rep target instead (see
    :func:`_next_pure_bodyweight`).
    """

    if added_kg is None:
        return _next_pure_bodyweight(reps, current, floor, ceiling, logged_sets)

    if any(logged.reps < floor for logged in logged_sets):
        stepped = _format_added(max(added_kg - DECREASE_KG, 0.0))
        return NextPrescription(ProgressionKind.ADDED_LOAD_STEP, reps, stepped)

    if _hit_ceiling(logged_sets, ceiling) and _low_effort(logged_sets):
        stepped = _format_added(added_kg + INCREASE_KG)
        return NextPrescription(ProgressionKind.ADDED_LOAD_STEP, reps, stepped)

    return NextPrescription(ProgressionKind.HOLD, reps, current)


def _next_pure_bodyweight(
    reps: str,
    current: str,
    floor: int,
    ceiling: int,
    logged_sets: list[_LoggedSet],
) -> NextPrescription:
    """Progress a pure-bodyweight Prescription by stepping its rep target (ADR-0026).

    With no weight to add, strong performance raises the target's floor one rep
    toward the ceiling, tightening the range upward. Once the target is already at
    the ceiling, reps can grow no further, so continued strong performance raises a
    harder-Variation suggestion instead of stalling (the movement is never swapped
    here — that stays a user-initiated Substitution). Anything short of strong work
    holds unchanged with no suggestion.
    """

    if not (_hit_ceiling(logged_sets, ceiling) and _low_effort(logged_sets)):
        return NextPrescription(ProgressionKind.HOLD, reps, current)

    if floor < ceiling:
        stepped = f"{floor + 1}-{ceiling}"
        return NextPrescription(ProgressionKind.REPS_STEP, stepped, current)

    return NextPrescription(
        ProgressionKind.HOLD, reps, current, suggest_harder_variation=True
    )


def _format_added(added: float) -> str:
    """Render a bodyweight load's added kilograms. Zero added collapses to the
    bare ``"bodyweight"`` movement rather than a redundant ``"+ 0 kg"``."""

    if added <= 0:
        return "bodyweight"
    number = int(added) if added == int(added) else added
    return f"bodyweight + {number} kg"


def _hit_ceiling(logged_sets: list[_LoggedSet], ceiling: int) -> bool:
    return all(logged.reps >= ceiling for logged in logged_sets)


def _low_effort(logged_sets: list[_LoggedSet]) -> bool:
    return all(
        logged.perceived_difficulty is not None
        and logged.perceived_difficulty <= LOW_EFFORT_MAX
        for logged in logged_sets
    )


def next_load(prescription: _Prescription, logged_sets: list[_LoggedSet]) -> str | None:
    """The recommended load half of :func:`next_prescription` (ADR-0004).

    Retained as the load-only view for callers that only overlay the load; the rep
    axis (pure-bodyweight progression) is read off :func:`next_prescription`.
    """

    return next_prescription(prescription, logged_sets).recommended_load
