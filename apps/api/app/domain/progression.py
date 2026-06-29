"""Progression — the deterministic, no-AI load adjustment (ADR-0004).

``next_load`` is a pure function: given an Exercise Prescription and the Logged
Sets the user actually performed, it returns the recommended load for the
*upcoming* Prescriptions of that Exercise. It costs no AI call and reads nothing
external, so a cached/Generated artifact is never touched — only the user's own
copy moves.

The rule is a fixed-increment double-progression: when every Logged Set meets the
top of the prescribed rep range at low perceived effort, the load steps up by
``INCREASE_KG``; when any set falls short of the bottom of the range, it steps
down by ``DECREASE_KG``; otherwise it holds. Loads are free-text (``"60 kg"``,
``"bodyweight"``, ``"70% 1RM"``), so anything without a single clean numeric value
is left untouched rather than mangled.
"""

from __future__ import annotations

import re
from typing import Protocol

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


def next_load(
    prescription: _Prescription, logged_sets: list[_LoggedSet]
) -> str | None:
    """Return the adjusted recommended load for ``prescription``'s next outing.

    Holds the current recommendation unchanged when there is nothing to act on —
    no Logged Sets, an unparseable rep target, or a load with no clean numeric
    value. Strong performance (every set at the rep ceiling, all at low perceived
    effort) steps the load up; otherwise it holds.
    """

    current = prescription.recommended_load
    if not logged_sets:
        return current
    if current is None:
        return None

    parsed = _parse_load(current)
    target = _parse_rep_target(prescription.reps)
    if parsed is None or target is None:
        return current

    value, suffix = parsed
    floor, ceiling = target

    # Missed reps take precedence: backing off is the cautious direction, so it is
    # decided before any increase even if effort happened to read as low.
    missed = any(logged.reps < floor for logged in logged_sets)
    if missed:
        return _format_load(max(value - DECREASE_KG, 0.0), suffix)

    hit_ceiling = all(logged.reps >= ceiling for logged in logged_sets)
    low_effort = all(
        logged.perceived_difficulty is not None
        and logged.perceived_difficulty <= LOW_EFFORT_MAX
        for logged in logged_sets
    )
    if hit_ceiling and low_effort:
        return _format_load(value + INCREASE_KG, suffix)

    return current
