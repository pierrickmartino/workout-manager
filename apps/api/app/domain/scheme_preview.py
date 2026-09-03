"""Scheme Preview — a plain-language projection of a Progression Scheme (ADR-0064/0065).

:func:`scheme_preview` is a pure, **read-time projection**: given a Prescription's chosen
Progression Scheme together with its current reps and typed Load, it returns one
plain-language sentence describing what the scheme will do *next* — the same species as
Tempo's phase expansion and three-state label. Nothing is stored and no record is touched;
it only *describes* the stepping rule the read-time overlay would apply (CONTEXT: Scheme
Preview).

The sentence reads **honestly for each Load kind**. A weight-axis scheme talks about adding
kilograms; a *pure*-bodyweight movement — which has no kilograms to add — speaks of reps
instead (never "add kg"); and a Load with no single value to step (%1RM, a range, a
qualitative note, or no Load at all) says so plainly rather than inventing a step. The
numbers it quotes are the very constants the schemes step by (``INCREASE_KG`` …), imported
from :mod:`app.domain.progression` so the description can never drift from the behaviour.
"""

from __future__ import annotations

from collections.abc import Callable
from enum import Enum

from app.domain.load import LoadKind, ParsedLoad
from app.domain.progression import (
    DECREASE_KG,
    INCREASE_KG,
    LOW_EFFORT_MAX,
    RESET_FRACTION,
    SESSION_COUNT_N,
    ProgressionScheme,
    _AMRAP_FLOOR_RE,
    _greyskull_floor,
    _is_pure_bodyweight,
    _parse_rep_target,
)

# Read-time typography: an en dash for a rep range ("8–12"), an em dash for the trailing
# aside. Chosen to match the example sentence in CONTEXT (Scheme Preview) rather than a
# hyphen, which the reps are *stored* with.
_EN_DASH = "–"
_EM_DASH = "—"


class _Axis(str, Enum):
    """Which axis a scheme would move on this Load — the one fact the sentence branches on.

    ``WEIGHT`` — an absolute kilogram load, or a bodyweight movement carrying added
    kilograms: the scheme steps the weight. ``REPS`` — a *pure* bodyweight movement with no
    kilograms to add: the scheme steps the rep target instead (so the sentence never says
    "add kg"). ``NONE`` — a %1RM, range, or qualitative Load, or no Load at all: there is no
    single value to step, and the sentence says as much.
    """

    WEIGHT = "weight"
    REPS = "reps"
    NONE = "none"


def _axis(load: ParsedLoad | None) -> _Axis:
    """Classify a typed Load into the axis a scheme would step (ADR-0026).

    Mirrors the Progression engine's own branch: an ``absolute`` Load and a
    bodyweight-*added* Load move kilograms (``WEIGHT``); a *pure* bodyweight Load moves its
    rep target (``REPS``); everything else — %1RM, range, qualitative, or absent — has no
    clean value to step (``NONE``).
    """

    if load is None:
        return _Axis.NONE
    if load.kind is LoadKind.ABSOLUTE:
        return _Axis.WEIGHT
    if load.kind is LoadKind.BODYWEIGHT:
        return _Axis.REPS if _is_pure_bodyweight(load) else _Axis.WEIGHT
    return _Axis.NONE


def _format_kg(value: float) -> str:
    """Render a kilogram amount without a trailing ``.0`` (``2.5`` → ``"2.5 kg"``, ``5.0`` → ``"5 kg"``)."""

    number = int(value) if value == int(value) else value
    return f"{number} kg"


def _rpe_phrase() -> str:
    """The low-effort gate as read text — the RPE at or below which a load may step up."""

    return f"RPE {LOW_EFFORT_MAX} or lower"


def _reset_percent() -> str:
    """The Greyskull deload as a whole-number percent (``RESET_FRACTION`` 0.9 → ``"10"``)."""

    return f"{round((1 - RESET_FRACTION) * 100)}"


def _ordinal(number: int) -> str:
    """Render a small ordinal (``3`` → ``"3rd"``) for the Session-Count cadence."""

    if 10 <= number % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(number % 10, "th")
    return f"{number}{suffix}"


def _reps_phrase(reps: str) -> str:
    """Render the current rep target for reading — reflecting the movement's own reps.

    A range renders with an en dash (``"8-12"`` → ``"8–12 reps"``); a single number
    (``"5"``) and an AMRAP-with-floor (``"5+"``) render as written; a floorless target
    (bare ``"AMRAP"`` or other free text) falls back to its trimmed text rather than a
    fabricated number, so the sentence still says something true.
    """

    target = _parse_rep_target(reps)
    if target is not None:
        floor, ceiling = target
        return f"{floor} reps" if floor == ceiling else f"{floor}{_EN_DASH}{ceiling} reps"
    if _AMRAP_FLOOR_RE.match(reps) is not None:
        return f"{_greyskull_floor(reps)}+ reps"
    stripped = reps.strip()
    return stripped if stripped else "the authored reps"


def _double_sentence(reps: str, load: ParsedLoad | None, axis: _Axis) -> str:
    """Double Progression — rep-ceiling-at-low-effort steps the load or bodyweight reps."""

    reps_phrase = _reps_phrase(reps)
    if axis is _Axis.NONE:
        return (
            "Double Progression needs a single load value to step, so it holds "
            f"{reps_phrase} at this load unchanged."
        )

    target = _parse_rep_target(reps)
    if target is None:
        return (
            "Double Progression needs a set rep target to step, so it holds "
            f"{reps_phrase} unchanged."
        )
    floor, ceiling = target

    if axis is _Axis.WEIGHT:
        return (
            f"Aim for {reps_phrase}; when every set reaches {ceiling} at {_rpe_phrase()}, "
            f"add {_format_kg(INCREASE_KG)} next time {_EM_DASH} miss the {floor}-rep floor "
            f"and it backs off {_format_kg(DECREASE_KG)}."
        )

    if floor < ceiling:
        return (
            f"Aim for {reps_phrase}; when every set reaches {ceiling} at {_rpe_phrase()}, "
            "add a rep to the target next time."
        )
    return (
        f"Aim for {reps_phrase}; when every set reaches {ceiling} at {_rpe_phrase()}, "
        "you'll be offered a harder variation rather than more reps."
    )


def _greyskull_sentence(reps: str, load: ParsedLoad | None, axis: _Axis) -> str:
    """Greyskull-style Linear — per-session weight step on the AMRAP-aware floor, reset on a miss."""

    if axis is not _Axis.WEIGHT:
        return (
            "Greyskull-style Linear only steps a weighted movement, so it can't adjust "
            "this load."
        )
    floor = _greyskull_floor(reps)
    if floor is None:
        return (
            "Greyskull-style Linear needs a rep floor to check, so it holds until the reps "
            "name one."
        )
    return (
        f"Do {_reps_phrase(reps)} with an all-out final set; clear the {floor}-rep floor and "
        f"add {_format_kg(INCREASE_KG)} next session {_EM_DASH} miss it and the load resets "
        f"down {_reset_percent()}%."
    )


def _session_count_sentence(reps: str, load: ParsedLoad | None, axis: _Axis) -> str:
    """Session-Count-Based — steps unconditionally every N-th performed exposure, never a clock."""

    ordinal = _ordinal(SESSION_COUNT_N)
    reps_phrase = _reps_phrase(reps)
    if axis is _Axis.NONE:
        return (
            "This load has no single value to step, so Session-Count-Based holds "
            f"{reps_phrase} at it every session."
        )
    if axis is _Axis.WEIGHT:
        return (
            f"Keep {reps_phrase}; every {ordinal} time you train this movement it adds "
            f"{_format_kg(INCREASE_KG)} automatically {_EM_DASH} no rep or effort target "
            "gates it, and it never steps down."
        )
    return (
        f"Every {ordinal} time you train this movement it adds a rep to the {reps_phrase} "
        f"target automatically {_EM_DASH} no effort target gates it, and it never steps down."
    )


def _static_sentence(reps: str, load: ParsedLoad | None, axis: _Axis) -> str:
    """Static — never auto-steps; holds the plan's authored values for every Load kind."""

    reps_phrase = _reps_phrase(reps)
    held = f"{reps_phrase} and its load" if load is not None else reps_phrase
    return (
        f"Static holds {held} exactly as written {_EM_DASH} nothing auto-adjusts; you set "
        "the numbers by hand."
    )


#: The curated dispatch table — one sentence builder per scheme in the closed catalog.
_SENTENCES: dict[
    ProgressionScheme, Callable[[str, ParsedLoad | None, _Axis], str]
] = {
    ProgressionScheme.DOUBLE_PROGRESSION: _double_sentence,
    ProgressionScheme.GREYSKULL: _greyskull_sentence,
    ProgressionScheme.SESSION_COUNT: _session_count_sentence,
    ProgressionScheme.STATIC: _static_sentence,
}


def scheme_preview(
    scheme: ProgressionScheme, reps: str, load: ParsedLoad | None
) -> str:
    """Render a Progression Scheme's stepping rule as one plain-language sentence (ADR-0064).

    A pure read-time projection from ``(scheme, reps, Load)`` — the same inputs the
    read-time Progression overlay resolves — that stores nothing and touches no record. The
    sentence reflects the movement's current reps and its Load *kind*, and reads honestly for
    each kind: a weight axis speaks of kilograms, a pure-bodyweight movement of reps, and a
    Load with no clean value to step says so. Dispatches through the closed per-scheme table,
    so every catalog member yields exactly one sentence.
    """

    return _SENTENCES[scheme](reps, load, _axis(load))


__all__ = ["scheme_preview"]
