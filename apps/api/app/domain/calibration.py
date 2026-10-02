"""Calibration — the user-directed, no-AI re-pitch of a Protocol's tail (ADR-0111).

A **Calibration** is a *relative offset from a Protocol's authored values*, never a position
on a scale. The user supplies the **direction**; this module supplies the **magnitude**, and
it is a pure function: it reads nothing external, makes no Generation Call, and touches no
cache. It is the fourth adaptation mechanism beside **Progression** (automatic,
per-Prescription, load-only), **Fitness Level folding** (reaches only the next generation),
and **Regeneration** (AI replacement of a Session's content).

Three inputs decide what one notch is worth, and each answers a different question:

- the **Fitness Level band** (``level_band``, on the generation cache's own cut points)
  decides the *magnitude*, as a fixed increment per band — never percentage math, for the
  reason ``progression.py`` already records: free-text loads are too noisy for it;
- the **recent record** (``resolve_lever``) decides *which lever* moves — recent un-done
  prescribed work means capacity ran out, so easier drops a **set**; completed work at high
  effort means capacity was fine and intensity was not, so easier moves the **Load**;
- the Prescription's own **Load kind** decides what that lever can actually touch, exactly as
  ``next_prescription`` branches (ADR-0026).

Two properties are load-bearing and both are tested:

**Totality.** No Prescription is a silent no-op. A ``percent_1rm``, ``range`` or
``qualitative`` Load has no clean number to move — it is precisely what Progression leaves
untouched — so the step moves the typed **Quantity** or the **set count** instead. A lever
that does nothing on a whole class of Prescriptions is not a lever.

**Path-independence.** Every resolved value is a function of the *offset*, not of the route
taken to it, computed as ``offset(desired) − offset(standing)``. So stacking two notches
agrees with one jump of two, crossing zero spends one easier step and one harder step rather
than two of either, and returning the offset to 0 restores the authored values. ADR-0111's
"not exactly reversible" cost is about the band, the lever or a floor *changing between acts*
— it is not a property of any single call here.

The **volume sub-cap** is the one deliberate non-linearity: sets move at most
``MAX_SET_DELTA`` per Prescription across the whole Calibration, and the remaining notches
fall through to the Load. The ±3 clamp bounds *intent*, not structure, and a Session whose
set count halved is barely the same Session — **Completion Outcome** would be measuring
something else.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from enum import Enum

from app.domain.completion import CompletionOutcome
from app.domain.effort import RIR_MAX, RIR_MIN, RPE_MAX, RPE_MIN, Effort, EffortScale
from app.domain.load import LoadKind, ParsedLoad, parse_load
from app.domain.quantity import Quantity, QuantityKind

# The offset is bounded *intent*: a user pressed against the rail is saying their declared
# Fitness Level is wrong, which the level fold — not a wider clamp — is what fixes.
MAX_CALIBRATION = 3
MIN_CALIBRATION = -MAX_CALIBRATION

# Fitness Level band cut points. Deliberately the same two the generation cache keys on
# (``cache.INTERMEDIATE_MIN_LEVEL`` / ``ADVANCED_MIN_LEVEL``), restated here rather than
# imported so the pure domain tier keeps its no-I/O-module dependency direction; a test
# holds the two registries to the same numbers.
INTERMEDIATE_MIN_LEVEL = 4
ADVANCED_MIN_LEVEL = 8

BEGINNER_BAND = "beginner"
INTERMEDIATE_BAND = "intermediate"
ADVANCED_BAND = "advanced"

# Kilograms per notch, per band. Fixed increments, not percentages (``progression.py``:
# "a fixed-increment step keeps the rule simple and auditable"). Easier travels further
# than harder in every band, inheriting Progression's deliberate asymmetry
# (``DECREASE_KG`` 5.0 against ``INCREASE_KG`` 2.5) — backing off is the cautious
# direction for a fitness app.
HARDER_STEP_KG: dict[str, float] = {
    BEGINNER_BAND: 2.5,
    INTERMEDIATE_BAND: 5.0,
    ADVANCED_BAND: 7.5,
}
EASIER_STEP_KG: dict[str, float] = {
    BEGINNER_BAND: 5.0,
    INTERMEDIATE_BAND: 10.0,
    ADVANCED_BAND: 15.0,
}

#: The volume sub-cap: how many sets one whole Calibration may move on a Prescription.
MAX_SET_DELTA = 1

#: A Session must keep at least one set of each movement — Deploy's own validation floor.
MIN_SETS = 1

# Rest moves for coherence: harder trains with less of it. Floored so a re-pitch can never
# prescribe a rest too short to be a rest.
REST_STEP_SECONDS = 15
MIN_REST_SECONDS = 15

# A Quantity moves by a proportion rather than a fixed amount: 5 km and 60 s share no unit,
# so there is no single number to add. One notch is this fraction of the authored amount.
QUANTITY_STEP_FRACTION = 0.1

# Target Effort steps for coherence only — it is descriptive in v1 and feeds no Progression
# (ADR-0066). RPE moves in its own half-steps; RIR moves whole reps, and *downward* for a
# harder notch, because fewer reps in reserve is harder.
RPE_STEP_PER_NOTCH = 0.5
RIR_STEP_PER_NOTCH = 1


class CalibrationLever(str, Enum):
    """Which axis a notch moves first — chosen from the recent record, not by the user.

    ``LOAD`` is the conservative member and the default: it leaves the Session's structure
    intact, so **Completion Outcome** keeps measuring the same prescribed work. ``VOLUME``
    is selected only when the record says capacity, not intensity, was the problem.
    """

    LOAD = "load"
    VOLUME = "volume"


@dataclass(frozen=True)
class PrescriptionPitch:
    """The spine fields a Calibration can move, and the shape it returns.

    A projection of ``PrescriptionDraft`` (ADR-0069) down to the calibratable subset — the
    exercise reference, Superset overlay, tempo, scheme, Set Type and Note are untouched by a
    re-pitch, so they are deliberately absent rather than carried through unread. ``Load``,
    ``Quantity`` and ``Target Effort`` are the stored dict forms, as the draft holds them.
    """

    sets: int
    reps: str
    recommended_load: dict | None
    prescribed_quantity: dict | None
    rest_seconds: int | None
    target_effort: dict | None


def clamp_calibration(value: int) -> int:
    """Bound a requested offset to ±``MAX_CALIBRATION``.

    Enforced here — and therefore server-side — rather than trusted from a client, the same
    posture ADR-0020 takes on Deploy's frozen-prefix invariant.
    """

    return max(MIN_CALIBRATION, min(MAX_CALIBRATION, value))


def level_band(fitness_level: int) -> str:
    """Coarsen a 1–10 Fitness Level into the band whose increment a notch uses."""

    if fitness_level >= ADVANCED_MIN_LEVEL:
        return ADVANCED_BAND
    if fitness_level >= INTERMEDIATE_MIN_LEVEL:
        return INTERMEDIATE_BAND
    return BEGINNER_BAND


def resolve_lever(recent_outcomes: Sequence[str]) -> CalibrationLever:
    """Pick the lever one notch moves first, from the user's recent Completion Outcomes.

    **Un-done prescribed work decides it.** A single Incomplete Logged Session in the window
    selects ``VOLUME``: the user ran out of capacity, so the honest "easier" is less work,
    not a lighter bar. Otherwise — completed work, however hard, or no record at all — the
    lever is ``LOAD``, which leaves the Session's structure (and so what its Completion
    Outcome measures) intact. A first-day user with no history therefore gets the
    conservative lever, and the profile alone still supplies the magnitude.

    The **Completion Outcome is the whole signal**, deliberately: logged Effort would only
    ever select ``LOAD``, which is already the fallback, so reading it would be ceremony
    that changes no answer. Should a third lever ever exist, this is where Effort enters.
    """

    if any(
        outcome == CompletionOutcome.INCOMPLETE.value for outcome in recent_outcomes
    ):
        return CalibrationLever.VOLUME
    return CalibrationLever.LOAD


def calibrate_prescription(
    prescription: PrescriptionPitch,
    *,
    standing: int,
    desired: int,
    lever: CalibrationLever,
    band: str,
) -> PrescriptionPitch:
    """Re-pitch one Prescription from the ``standing`` offset to the ``desired`` one.

    Returns a **new** ``PrescriptionPitch``; the input is never mutated. Every field is
    resolved as ``offset(desired) − offset(standing)``, which is what makes a stacked
    Calibration agree with a single jump and a return to 0 restore the authored values.

    Both offsets are clamped, so an out-of-range request is bounded rather than rejected
    here — refusal is the service tier's business, and a pure function has no vocabulary for
    it.
    """

    start = clamp_calibration(standing)
    end = clamp_calibration(desired)
    if start == end:
        return prescription

    # The *effective* lever, not the record's preference: a Prescription with no movable
    # amount axis has only its set count, so the volume lever is forced there regardless of
    # what the record would have chosen. Resolved once, before any field moves, so the sets
    # and the amounts can never disagree about which axis is carrying the offset.
    effective = _effective_lever(prescription, lever)

    load, quantity = _calibrated_amounts(prescription, start, end, effective, band)

    return replace(
        prescription,
        sets=_calibrated_sets(prescription.sets, start, end, effective),
        recommended_load=load,
        prescribed_quantity=quantity,
        rest_seconds=_calibrated_rest(prescription.rest_seconds, start, end),
        target_effort=_calibrated_target_effort(prescription.target_effort, start, end),
    )


# ------------------------------------------------------------------ offsets per axis


def _effective_lever(
    prescription: PrescriptionPitch, lever: CalibrationLever
) -> CalibrationLever:
    """The lever that can actually move this Prescription.

    The record's preference is honoured whenever an amount axis can carry the offset — a
    movable Load, or a typed Quantity holding a number. When neither can, the set count is
    the only axis left, so ``VOLUME`` is forced: this is what keeps the rule **total**, and
    it is why a ``70% 1RM`` or ``qualitative`` Prescription is re-pitched rather than
    silently skipped.
    """

    if lever is CalibrationLever.VOLUME:
        return lever
    if _movable_load(prescription.recommended_load) is not None:
        return lever
    if _movable_quantity(prescription.prescribed_quantity) is not None:
        return lever
    return CalibrationLever.VOLUME


def _set_offset(calibration: int, lever: CalibrationLever) -> int:
    """How many sets the whole Calibration moves — sub-capped at ``MAX_SET_DELTA``.

    Zero unless the record selected the volume lever. The cap is why a −3 on that lever is
    one set plus two notches of Load rather than three sets gone.
    """

    if lever is not CalibrationLever.VOLUME or calibration == 0:
        return 0
    magnitude = min(abs(calibration), MAX_SET_DELTA)
    return magnitude if calibration > 0 else -magnitude


def _amount_notches(calibration: int, lever: CalibrationLever) -> int:
    """The notches the Load / Quantity axis carries: everything the set sub-cap did not.

    This is what makes the sub-cap a *redistribution* rather than a discount — the offset the
    user asked for is always fully spent, just not all of it on structure.
    """

    return calibration - _set_offset(calibration, lever)


def _kg_offset(calibration: int, lever: CalibrationLever, band: str) -> float:
    """The whole Calibration's kilogram offset, signed, in ``band``'s increments.

    Expressed as an absolute offset from the authored value rather than a per-act delta, so
    crossing zero spends one *easier* step and one *harder* step — not two of either.
    """

    notches = _amount_notches(calibration, lever)
    if notches == 0:
        return 0.0
    step = HARDER_STEP_KG[band] if notches > 0 else EASIER_STEP_KG[band]
    return notches * step


# --------------------------------------------------------------------- field steppers


def _calibrated_sets(sets: int, start: int, end: int, lever: CalibrationLever) -> int:
    """Step the set count, floored at ``MIN_SETS``.

    A floored step is still *spent*: the notch is not re-charged to the Load, which would
    overshoot the offset the user asked for. That is the one place the sub-cap and the floor
    together make a Calibration lossy, and it is recorded in ADR-0111's consequences.
    """

    delta = _set_offset(end, lever) - _set_offset(start, lever)
    return max(MIN_SETS, sets + delta)


def _calibrated_amounts(
    prescription: PrescriptionPitch,
    start: int,
    end: int,
    lever: CalibrationLever,
    band: str,
) -> tuple[dict | None, dict | None]:
    """Resolve the Load and the Quantity together, because which one moves depends on both.

    The order of preference is what keeps the rule **total**:

    1. a Load with a movable number (``absolute``, or ``bodyweight`` carrying added
       kilograms) takes the step — the axis Progression itself moves;
    2. otherwise a typed **Quantity** that carries a number takes it — shortening a run is
       what "one notch easier" means for a 5 km prescription, where dropping its single set
       would delete the work entirely;
    3. otherwise the **set count** takes it, which ``_calibrated_sets`` has already applied
       by forcing the volume lever below.

    A Load with no clean value — ``percent_1rm``, ``range``, ``qualitative`` — is left
    **verbatim** rather than mangled, exactly as ``next_prescription`` leaves it.
    """

    load = prescription.recommended_load
    quantity = prescription.prescribed_quantity

    parsed = _movable_load(load)
    if parsed is not None:
        return _stepped_load(parsed, start, end, lever, band), quantity

    movable = _movable_quantity(quantity)
    if movable is not None:
        return load, _stepped_quantity(movable, start, end, lever)

    # Neither amount axis carries a number: the set count is taking the whole offset, and
    # ``_effective_lever`` has already forced the volume lever so that it does. Both values
    # pass through verbatim — an unmovable Load is left exactly as authored rather than
    # mangled, the same choice ``next_prescription`` makes.
    return load, quantity


def _movable_load(stored: dict | None) -> ParsedLoad | None:
    """The parsed Load if it carries a single number a step can move, else ``None``.

    An ``absolute`` load moves its kilograms; a ``bodyweight`` load moves its *added*
    kilograms, and a pure-bodyweight movement (no added weight) has none — its difficulty
    axis is reps, which lives on the Quantity, not the Load (ADR-0026). A ``percent_1rm``,
    ``range`` or ``qualitative`` load has no clean value at all.
    """

    if stored is None:
        return None

    parsed = parse_load(stored["text"])
    if parsed.kind is LoadKind.ABSOLUTE and parsed.kg is not None:
        return parsed
    if parsed.kind is LoadKind.BODYWEIGHT and parsed.added_kg is not None:
        return parsed
    return None


def _movable_quantity(stored: dict | None) -> Quantity | None:
    """The typed Quantity if it carries a number a step can scale, else ``None``.

    A ``repetitions`` Quantity with no count — a range (``"8-12"``), an ``AMRAP`` — carries
    no single number, so it declines the step and the set count takes the offset instead.
    """

    if stored is None:
        return None

    quantity = Quantity.from_dict(stored)
    carries = {
        QuantityKind.DISTANCE: quantity.metres,
        QuantityKind.DURATION: quantity.seconds,
        QuantityKind.REPETITIONS: quantity.count,
    }.get(quantity.kind)
    return quantity if carries is not None else None


def _stepped_load(
    parsed: ParsedLoad,
    start: int,
    end: int,
    lever: CalibrationLever,
    band: str,
) -> dict:
    """Apply the kilogram delta to a movable Load, never below zero."""

    delta = _kg_offset(end, lever, band) - _kg_offset(start, lever, band)

    if parsed.kind is LoadKind.BODYWEIGHT:
        added = max((parsed.added_kg or 0.0) + delta, 0.0)
        return parse_load(_format_added(added)).to_dict()

    kilograms = max((parsed.kg or 0.0) + delta, 0.0)
    return parse_load(_format_kg(kilograms)).to_dict()


def _stepped_quantity(
    quantity: Quantity, start: int, end: int, lever: CalibrationLever
) -> dict:
    """Scale a movable Quantity's number by the offset.

    Proportional rather than a fixed amount, because the kinds share no unit — there is no
    single number to add to both 5 km and 60 s, while 10% of each is "one notch" of either.
    """

    factor = 1.0 + QUANTITY_STEP_FRACTION * (
        _amount_notches(end, lever) - _amount_notches(start, lever)
    )

    if quantity.kind is QuantityKind.DISTANCE:
        return _rendered_quantity(
            quantity, metres=max((quantity.metres or 0.0) * factor, 0.0)
        )
    if quantity.kind is QuantityKind.DURATION:
        return _rendered_quantity(
            quantity, seconds=max((quantity.seconds or 0.0) * factor, 0.0)
        )
    # A counted ``repetitions`` Quantity: reps are whole, and never fewer than one.
    return _rendered_quantity(
        quantity, count=max(round((quantity.count or 0) * factor), 1)
    )


def _rendered_quantity(quantity: Quantity, **payload) -> dict:
    """A stepped Quantity with its ``text`` re-rendered to match its new number.

    The stored ``text`` is the display-ready form (ADR-0032), so leaving it at the authored
    value would show a 5 km run that is really 4.5 km — the one way a materialised re-pitch
    could lie on screen.
    """

    stepped = replace(quantity, **payload)
    return replace(stepped, text=_quantity_text(stepped)).to_dict()


def _quantity_text(quantity: Quantity) -> str:
    """Render a Quantity's canonical display text from its number."""

    if quantity.kind is QuantityKind.DISTANCE and quantity.metres is not None:
        kilometres = quantity.metres / 1000.0
        return f"{_number(kilometres)} km"
    if quantity.kind is QuantityKind.DURATION and quantity.seconds is not None:
        return f"{_number(quantity.seconds)}s"
    if quantity.kind is QuantityKind.REPETITIONS and quantity.count is not None:
        return str(quantity.count)
    return quantity.text


def _calibrated_rest(rest_seconds: int | None, start: int, end: int) -> int | None:
    """Step the rest, floored. Harder trains with less of it, so the sign is inverted.

    An absent rest stays absent: a Calibration re-pitches what the plan says, and inventing
    a rest the author never prescribed would be authoring, not re-pitching.
    """

    if rest_seconds is None:
        return None
    delta = -REST_STEP_SECONDS * (end - start)
    return max(MIN_REST_SECONDS, rest_seconds + delta)


def _calibrated_target_effort(stored: dict | None, start: int, end: int) -> dict | None:
    """Step the Target Effort for coherence, clamped inside its own scale.

    Descriptive only in v1 — it feeds no Progression (ADR-0066) — so this moves purely so the
    plan reads consistently with the numbers beside it. RPE rises for a harder notch; RIR
    *falls*, because fewer reps in reserve is harder.
    """

    if stored is None:
        return None

    effort = Effort.from_dict(stored)
    notches = end - start

    if effort.scale is EffortScale.RPE:
        value = effort.value + RPE_STEP_PER_NOTCH * notches
        bounded = max(RPE_MIN, min(RPE_MAX, value))
    else:
        value = effort.value - RIR_STEP_PER_NOTCH * notches
        bounded = float(max(RIR_MIN, min(RIR_MAX, int(value))))

    return Effort(scale=effort.scale, value=bounded).to_dict()


# -------------------------------------------------------------------------- rendering


def _format_kg(value: float) -> str:
    """Render an absolute load the way ``progression.py`` does, so a calibrated value and a
    progressed one are indistinguishable in the plan."""

    return f"{_number(value)} kg"


def _format_added(added: float) -> str:
    """Render a bodyweight load's added kilograms, collapsing nothing-added to the bare
    movement — Progression's own rule (ADR-0026), restated so a calibrated Load and a
    progressed one agree character for character."""

    if added <= 0:
        return "bodyweight"
    return f"bodyweight + {_number(added)} kg"


def _number(value: float) -> str:
    """Drop a trailing ``.0`` so ``70.0`` renders ``70`` — ``load._format_number``'s rule."""

    rounded = round(value, 2)
    return str(int(rounded)) if rounded == int(rounded) else str(rounded)


__all__ = [
    "ADVANCED_BAND",
    "BEGINNER_BAND",
    "EASIER_STEP_KG",
    "HARDER_STEP_KG",
    "INTERMEDIATE_BAND",
    "MAX_CALIBRATION",
    "MAX_SET_DELTA",
    "MIN_CALIBRATION",
    "MIN_REST_SECONDS",
    "MIN_SETS",
    "CalibrationLever",
    "PrescriptionPitch",
    "calibrate_prescription",
    "clamp_calibration",
    "level_band",
    "resolve_lever",
]
