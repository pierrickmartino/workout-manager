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
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from typing import Protocol

from app.domain.load import LoadKind, ParsedLoad, parse_load
from app.domain.quantity import repetitions_of

# A fixed-increment step keeps the rule simple and auditable (vs. percentage math
# on noisy free-text loads). Reductions are larger than increases: backing off
# after missed reps is the cautious direction for a fitness app.
INCREASE_KG = 2.5
DECREASE_KG = 5.0

# The Greyskull-style Linear deload (ADR-0064): a miss resets the Load *down* by a
# fixed fraction of its current value (−10%), not the cautious fixed ``DECREASE_KG``.
# The fraction is the trait that distinguishes it from Double Progression's back-off.
RESET_FRACTION = 0.9

# Perceived difficulty is an RPE-style 1–10 score; at or below this the effort is
# "low" enough to justify adding load. Above it, the set counts as hard and the
# load only holds.
LOW_EFFORT_MAX = 7

_LOAD_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)(.*)$", re.DOTALL)
_RANGE_REPS_RE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*$")
_SINGLE_REPS_RE = re.compile(r"^\s*(\d+)\s*$")
# The AMRAP-with-floor grammar Greyskull reads (ADR-0064): ``"5+"`` — five-or-more.
_AMRAP_FLOOR_RE = re.compile(r"^\s*(\d+)\s*\+\s*$")


class _Prescription(Protocol):
    reps: str
    recommended_load: str | None


class _LoggedSet(Protocol):
    # The typed amount axis (ADR-0032); its rep count is read through
    # ``repetitions_of``. A set with a non-rep amount (a run, a hold) has ``None`` reps
    # and neither counts as a missed-reps miss nor as having hit the rep ceiling.
    quantity: dict | None
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


def parse_rep_range(text: str) -> tuple[int, int] | None:
    """Validate a user-supplied rep target and return its ``(floor, ceiling)``, or ``None``.

    The boundary check for a Pinned Target (ADR-0053): a single number (``"12"`` →
    ``(12, 12)``) or a range (``"10-14"`` → ``(10, 14)``) is accepted only when it is a
    sane, non-empty range — both bounds at least one rep and ``floor <= ceiling``. A
    reversed range (``"14-10"``), a zero/negative bound, or free text (``"AMRAP"``)
    returns ``None`` so a nonsensical target can never be pinned. Reuses the same rep
    grammar :func:`_parse_rep_target` reads, then layers the ordering/positivity rule the
    stored progression target never had to enforce.
    """

    parsed = _parse_rep_target(text)
    if parsed is None:
        return None
    floor, ceiling = parsed
    if floor < 1 or floor > ceiling:
        return None
    return floor, ceiling


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


class ProgressionScheme(str, Enum):
    """The identity of a Progression Scheme — a member of a curated, closed set (ADR-0064).

    A scheme names one deterministic stepping strategy a Prescription can carry. The
    set is fixed, never user- or AI-authored: an unvalidated stepping rule is a safety
    risk in an injury/rehab-cautious domain, the same reasoning that keeps the Skin,
    Muscle Group, and Achievement catalogs closed. ``DOUBLE_PROGRESSION`` is the
    default — the existing engine, named rather than rewritten — so an unset selection
    resolves to exactly today's behaviour. ``STATIC`` never auto-steps and holds the
    plan's authored values.

    ``GREYSKULL`` is the loaded-movement methodology bounded to absolute and
    bodyweight-added Loads: it steps up per session on hitting the rep floor and
    deloads by a fixed fraction on a miss. The v1 catalog still grows here — the
    Session-Count-Based scheme lands as later work registers it.
    """

    DOUBLE_PROGRESSION = "double_progression"
    STATIC = "static"
    GREYSKULL = "greyskull"


#: The system-wide default every Prescription inherits when it carries no scheme.
#: Resolving to Double Progression keeps existing plans and records unaffected.
DEFAULT_SCHEME = ProgressionScheme.DOUBLE_PROGRESSION


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


@dataclass(frozen=True)
class PinOffer:
    """The offer to Pin a user-chosen bodyweight rep target, with the range to pre-fill.

    Returned by :func:`pin_offer` only when a logged movement *qualifies* to be offered
    a Pin (ADR-0053). ``proposed_reps`` is the editable target the confirm dialog
    pre-fills — kept in the prescription's **existing shape** (a single number stays a
    single number, a floor–ceiling range stays a range) and derived from the reps the
    user actually performed, so the common case needs no typing.
    """

    proposed_reps: str


def pin_offer(
    prescription: _Prescription, logged_sets: list[_LoggedSet]
) -> PinOffer | None:
    """Decide whether a logged movement qualifies to be offered a Pin (ADR-0053, #370).

    The single source of truth the web offer mirrors, sitting beside the Progression
    engine it extends. Pure: no I/O, no storage — it computes nothing that is stored,
    only the decision and the range to pre-fill. Returns a :class:`PinOffer` when the
    Prescription qualifies, or ``None`` when it does not (the predicate is simply
    ``pin_offer(...) is not None``).

    A Prescription qualifies when **both** hold:

    - it is **pure bodyweight** — the one axis Progression steps by reps: the same
      ``LoadKind.BODYWEIGHT`` + no-added-load condition the pure-bodyweight Progression
      path routes through, shared as :func:`_is_pure_bodyweight`; and
    - **every** working Logged Set's repetitions are strictly **greater than the rep
      range ceiling** — "more than the plan asked," on all sets, so a single fluke set
      can't ossify the standing target.

    Deliberately **not** gated on perceived effort — unlike Progression's own
    ``_hit_ceiling and _low_effort`` step, the human confirmation in the dialog replaces
    the low-RPE gate, so a hard session that still beat the ceiling is offered.

    The proposed pre-fill keeps the prescription's existing shape and is derived from
    the performed reps: the floor is the minimum reps performed (the reliable target hit
    on every set); a range carries that floor up to the maximum performed as its new
    ceiling, while a single-number target collapses to the floor alone.
    """

    current = prescription.recommended_load
    if current is None or not logged_sets:
        return None

    target = _parse_rep_target(prescription.reps)
    if target is None:
        return None
    _, ceiling = target

    # Pure bodyweight only (BODYWEIGHT kind with nothing added): a weighted-bodyweight
    # or non-bodyweight load progresses on a different axis and is never offered a rep Pin.
    if not _is_pure_bodyweight(parse_load(current)):
        return None

    if not _all_above_ceiling(logged_sets, ceiling):
        return None

    performed = [
        reps
        for logged in logged_sets
        if (reps := repetitions_of(logged.quantity)) is not None
    ]
    floor, top = min(performed), max(performed)
    single = target[0] == target[1]
    proposed = str(floor) if single else f"{floor}-{top}"
    return PinOffer(proposed_reps=proposed)


def _double_progression(
    prescription: _Prescription, logged_sets: list[_LoggedSet]
) -> NextPrescription:
    """The Double Progression step — the default scheme, today's engine unchanged (ADR-0064).

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
    if _missed_reps(logged_sets, floor):
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

    if _missed_reps(logged_sets, floor):
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


def _missed_reps(logged_sets: list[_LoggedSet], floor: int) -> bool:
    """Whether any set fell below the rep floor — a miss that backs the load off.

    A set with no rep count (a distance or duration amount, ADR-0032) is not a
    missed-reps event and is skipped, never triggering a decrease.
    """

    return any(
        (reps := repetitions_of(logged.quantity)) is not None and reps < floor
        for logged in logged_sets
    )


def _hit_ceiling(logged_sets: list[_LoggedSet], ceiling: int) -> bool:
    """Whether every set reached the rep ceiling. A set with no rep count has not
    reached it, so its presence holds the load rather than stepping it up."""

    return all(
        (reps := repetitions_of(logged.quantity)) is not None and reps >= ceiling
        for logged in logged_sets
    )


def _met_floor(logged_sets: list[_LoggedSet], floor: int) -> bool:
    """Whether at least one set demonstrably reached the rep floor — the Greyskull hit.

    A hit needs positive evidence: some rep-bearing set at or above the floor. A
    session of only non-rep sets (a hold, a run) offers none, so the Load holds rather
    than stepping up. Distinct from :func:`_hit_ceiling`: Greyskull gates on the floor,
    not the ceiling, and one set clearing it is enough (the final set is AMRAP)."""

    return any(
        (reps := repetitions_of(logged.quantity)) is not None and reps >= floor
        for logged in logged_sets
    )


def _is_pure_bodyweight(load: ParsedLoad) -> bool:
    """Whether a Load is **pure bodyweight** — the reps-only progression axis (ADR-0026).

    True only for a ``BODYWEIGHT`` Load carrying no added kilograms: the same condition
    the pure-bodyweight Progression path routes through (:func:`next_prescription`
    branches on the kind, then :func:`_next_bodyweight` on ``added_kg is None``). Named
    once here so the Pin offer and the Progression step judge "pure bodyweight" by one
    rule rather than drifting apart.
    """

    return load.kind is LoadKind.BODYWEIGHT and load.added_kg is None


def _all_above_ceiling(logged_sets: list[_LoggedSet], ceiling: int) -> bool:
    """Whether every set landed **strictly above** the rep ceiling — the Pin trigger.

    Distinct from :func:`_hit_ceiling` (``>= ceiling``): the Pin offer means
    unambiguously *more* than the plan asked, so a set merely *at* the ceiling does not
    qualify. A set with no rep count (a hold, a run) has no reps above the ceiling and
    so holds the offer back, mirroring how :func:`_hit_ceiling` treats a non-rep set.
    """

    return all(
        (reps := repetitions_of(logged.quantity)) is not None and reps > ceiling
        for logged in logged_sets
    )


def _low_effort(logged_sets: list[_LoggedSet]) -> bool:
    return all(
        logged.perceived_difficulty is not None
        and logged.perceived_difficulty <= LOW_EFFORT_MAX
        for logged in logged_sets
    )


def _static(
    prescription: _Prescription, logged_sets: list[_LoggedSet]
) -> NextPrescription:
    """The Static step — never auto-steps; holds the plan's authored values (ADR-0064).

    Returns ``HOLD`` with the Prescription's own ``reps`` and ``recommended_load``
    unchanged, for *every* Load kind, and never raises the harder-Variation offer: the
    user drives these numbers by hand, so nothing in the record moves them. The Logged
    Sets are deliberately unread — holding is the whole contract — so any authored
    later-week deloads survive intact rather than being flattened by a step.
    """

    return NextPrescription(
        ProgressionKind.HOLD, prescription.reps, prescription.recommended_load
    )


def _greyskull_floor(reps: str) -> int | None:
    """Read the rep **floor** a Greyskull session must meet (ADR-0064).

    Greyskull cares only about the floor — the minimum the (AMRAP) final set must reach
    to count as a hit — so a plain number (``"5"``) or a range (``"5-8"``) yields its
    lower bound via the shared grammar, and an AMRAP form (``"5+"`` — five-or-more)
    yields the number before the ``+``. Unlike Double Progression's
    :func:`_parse_rep_target`, this *reads* the AMRAP notation instead of returning
    ``None`` and holding on it (ADR-0064: "AMRAP reps become meaningful"). A floorless
    target (bare ``"AMRAP"``) still returns ``None`` — there is no number to test a hit
    against — so the scheme holds rather than stepping blind.
    """

    target = _parse_rep_target(reps)
    if target is not None:
        return target[0]

    amrap = _AMRAP_FLOOR_RE.match(reps)
    if amrap is not None:
        return int(amrap.group(1))
    return None


def _greyskull(
    prescription: _Prescription, logged_sets: list[_LoggedSet]
) -> NextPrescription:
    """The Greyskull-style Linear step — per-session linear load, reset on failure (ADR-0064).

    Bounded to absolute and bodyweight-*added* Loads (the registry rejects the rest at
    selection time). Reading only the user's Logged Sets, and never a shared/cached
    artifact, it steps the weight axis every session a hit lands — the rep floor met on
    the AMRAP-aware final set, with **no low-effort gate** (its defining departure from
    Double Progression's cautious ceiling+RPE step) — and, on a miss below the floor,
    resets the weight *down* by ``RESET_FRACTION`` rather than the fixed
    ``DECREASE_KG``. Holds unchanged when there is nothing to act on: no Logged Sets, an
    unreadable rep floor, a pure-bodyweight movement (no kilograms to step), or a Load
    with no clean numeric value.
    """

    current = prescription.recommended_load
    reps = prescription.reps
    if not logged_sets or current is None:
        return NextPrescription(ProgressionKind.HOLD, reps, current)

    floor = _greyskull_floor(reps)
    if floor is None:
        return NextPrescription(ProgressionKind.HOLD, reps, current)

    # The typed Load fixes which axis moves (ADR-0010): a bodyweight movement steps its
    # added kilograms; a pure-bodyweight movement has none and is left to hold.
    load = parse_load(current)
    if load.kind is LoadKind.BODYWEIGHT:
        if load.added_kg is None:
            return NextPrescription(ProgressionKind.HOLD, reps, current)
        return _greyskull_added(reps, current, load.added_kg, floor, logged_sets)

    parsed = _parse_load(current)
    if parsed is None:
        return NextPrescription(ProgressionKind.HOLD, reps, current)
    value, suffix = parsed

    # Missed reps take precedence: backing off is the cautious direction, decided before
    # any step-up. The reset is a fraction of the current Load, not a fixed decrease.
    if _missed_reps(logged_sets, floor):
        stepped = _format_load(value * RESET_FRACTION, suffix)
        return NextPrescription(ProgressionKind.LOAD_STEP, reps, stepped)

    if _met_floor(logged_sets, floor):
        stepped = _format_load(value + INCREASE_KG, suffix)
        return NextPrescription(ProgressionKind.LOAD_STEP, reps, stepped)

    return NextPrescription(ProgressionKind.HOLD, reps, current)


def _greyskull_added(
    reps: str,
    current: str,
    added_kg: float,
    floor: int,
    logged_sets: list[_LoggedSet],
) -> NextPrescription:
    """Step the *added* kilograms of a bodyweight-added Load under Greyskull (ADR-0064).

    The extra load behaves exactly like an absolute Load: a miss resets it by
    ``RESET_FRACTION``, a met floor steps it up by ``INCREASE_KG``. A reset that reaches
    zero collapses back to a bare ``"bodyweight"`` movement (see :func:`_format_added`).
    """

    if _missed_reps(logged_sets, floor):
        stepped = _format_added(added_kg * RESET_FRACTION)
        return NextPrescription(ProgressionKind.ADDED_LOAD_STEP, reps, stepped)

    if _met_floor(logged_sets, floor):
        stepped = _format_added(added_kg + INCREASE_KG)
        return NextPrescription(ProgressionKind.ADDED_LOAD_STEP, reps, stepped)

    return NextPrescription(ProgressionKind.HOLD, reps, current)


# The two universal schemes apply to the full Load vocabulary: Double Progression is the
# default every movement inherits (it simply holds a Load with no clean value to move),
# and Static holds every Load kind by construction.
_ALL_LOAD_KINDS: frozenset[LoadKind] = frozenset(LoadKind)

# Greyskull is a loaded-movement scheme: it moves a clean kilogram axis, so it is bounded
# to absolute and bodyweight Loads. The finer "bodyweight-added only, not pure" cut is a
# distinction LoadKind can't carry, expressed by ``excludes_pure_bodyweight`` below.
_LOADED_LOAD_KINDS: frozenset[LoadKind] = frozenset(
    {LoadKind.ABSOLUTE, LoadKind.BODYWEIGHT}
)


@dataclass(frozen=True)
class _SchemeEntry:
    """A registered scheme: its pure step function and the Loads it applies to.

    ``load_kinds`` is the coarse LoadKind gate. ``excludes_pure_bodyweight`` layers the
    one refinement LoadKind can't express — a scheme that steps a weight axis (Greyskull)
    has nothing to move on a *pure* bodyweight movement, so it rejects that even though
    it accepts a bodyweight-*added* Load of the same kind."""

    step: Callable[[_Prescription, list[_LoggedSet]], NextPrescription]
    load_kinds: frozenset[LoadKind]
    excludes_pure_bodyweight: bool = False


# The curated, closed registry — the one place every scheme is collected, and the one
# place the two registry-wide invariants (ADR-0064) hold for *all* schemes at once:
#   1. Never auto-swap. A scheme returns a :class:`NextPrescription`, whose shape has
#      no channel to swap a movement; a scheme that drives a pure-bodyweight rep target
#      to its ceiling raises ``suggest_harder_variation`` rather than growing reps
#      unbounded (see :func:`_next_pure_bodyweight`). The swap stays a user-initiated
#      Substitution.
#   2. Load-kind honesty. Each entry declares its compatible Load kinds; selecting an
#      incompatible scheme is answered by :func:`scheme_applies_to` (used at selection
#      time to reject a movement labelled one way but behaving another).
_REGISTRY: dict[ProgressionScheme, _SchemeEntry] = {
    ProgressionScheme.DOUBLE_PROGRESSION: _SchemeEntry(_double_progression, _ALL_LOAD_KINDS),
    ProgressionScheme.STATIC: _SchemeEntry(_static, _ALL_LOAD_KINDS),
    ProgressionScheme.GREYSKULL: _SchemeEntry(
        _greyskull, _LOADED_LOAD_KINDS, excludes_pure_bodyweight=True
    ),
}


def resolve_scheme(selection: str | None) -> ProgressionScheme:
    """Resolve a Prescription's stored scheme selection to a ``ProgressionScheme`` (ADR-0064).

    The one place the read path turns a stored *choice* into a step function's identity.
    A null selection — the default every existing Prescription carries, and every
    generated or adopted plan (generation never emits a scheme in v1) — resolves to
    :data:`DEFAULT_SCHEME` (Double Progression), so an unset movement behaves exactly as
    it did before a scheme could be chosen. A non-null value is the closed enum's own
    string, so it maps straight back to its member; an unrecognized value raises rather
    than silently substituting a scheme, since a stored selection is only ever written
    through the (future) validated selection path.
    """

    if selection is None:
        return DEFAULT_SCHEME
    return ProgressionScheme(selection)


def scheme_applies_to(scheme: ProgressionScheme, load_kind: LoadKind) -> bool:
    """Whether a scheme applies to a Prescription's Load kind — the compatibility predicate.

    A pure function over the registry's per-scheme compatible Load kinds (ADR-0064).
    The selection write path uses it to reject an incompatible choice; here it only
    answers the question, never mutating anything. It is the *coarse* gate:
    :func:`scheme_applies_to_load` refines it for a scheme that steps a weight axis.
    """

    return load_kind in _REGISTRY[scheme].load_kinds


def scheme_applies_to_load(scheme: ProgressionScheme, load: ParsedLoad) -> bool:
    """Whether a scheme applies to a *typed* Load — the full compatibility predicate (ADR-0064).

    Refines :func:`scheme_applies_to` (the coarse LoadKind gate) with the one distinction
    LoadKind can't carry: a scheme that steps a weight axis (``excludes_pure_bodyweight``)
    rejects a **pure-bodyweight** Load — a ``BODYWEIGHT`` kind with nothing added, which
    has no kilograms to move — while still accepting a bodyweight-*added* Load of the
    same kind. Greyskull (absolute + bodyweight-added only) is the scheme this matters
    for; the universal schemes never exclude, so the two predicates agree for them. Given
    the full ParsedLoad, the selection write path prefers this over the LoadKind gate.
    """

    entry = _REGISTRY[scheme]
    if load.kind not in entry.load_kinds:
        return False
    if entry.excludes_pure_bodyweight and _is_pure_bodyweight(load):
        return False
    return True


def next_prescription(
    prescription: _Prescription,
    logged_sets: list[_LoggedSet],
    scheme: ProgressionScheme = DEFAULT_SCHEME,
) -> NextPrescription:
    """Return the deterministically adjusted Prescription for its next outing.

    Dispatches through the closed scheme registry to the selected scheme's step
    function; an omitted ``scheme`` resolves to Double Progression, so every existing
    caller behaves exactly as before. Each step is a pure function of the Prescription
    and the user's Logged Sets, returning the same :class:`NextPrescription` shape.
    """

    return _REGISTRY[scheme].step(prescription, logged_sets)


def next_load(prescription: _Prescription, logged_sets: list[_LoggedSet]) -> str | None:
    """The recommended load half of :func:`next_prescription` (ADR-0004).

    Retained as the load-only view for callers that only overlay the load; the rep
    axis (pure-bodyweight progression) is read off :func:`next_prescription`.
    """

    return next_prescription(prescription, logged_sets).recommended_load
