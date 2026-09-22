"""Muscle — the curated canonical muscle vocabulary beneath the six Muscle Groups.

Where :mod:`app.domain.muscle_groups` rolls a free-form targeted muscle up into one of
six coarse **Muscle Groups** (Legs, Chest, Back, Shoulders, Arms, Core), this module
introduces the *finer* tier the anatomical Muscle Atlas will read: a curated set of ~40
individual **Muscles**, each nesting under **exactly one** of those same six groups. The
six groups stay the roll-up tier — Muscle Split, Muscle Balance, the Full-Coverage
achievement, and the Coverage read keep working unchanged on top — so this is a strict
refinement, not a replacement (the prefactor behind issue #539).

Two curated tables, kept as data (not heuristics) so both stay auditable and deterministic,
the same species as the Muscle Group roll-up, Movement Pattern (ADR-0072), and Equipment
(ADR-0077):

- ``MUSCLE_TO_GROUP`` fixes each canonical :class:`Muscle`'s parent :class:`MuscleGroup`.
  The completeness invariant — *every* Muscle has a group — is asserted by a unit test, so
  a new muscle can never enter the vocabulary without a home group.
- ``_FREEFORM_TO_MUSCLE`` maps the free-form strings the catalog emits (with the common
  synonyms and singular/plural forms) to a canonical Muscle. ``classify_muscle`` reads it
  case- and whitespace-insensitively, exactly mirroring ``muscle_groups.classify`` — and an
  unknown or AI-invented muscle falls through to :data:`Muscle.UNCLASSIFIED`, never guessed
  at, the honesty twin of the group roll-up's Unclassified bucket.

A **bare region term** ("back", "shoulders", "core") names a Muscle Group, not one muscle,
so it stays Unclassified at *this* tier while still rolling up to its group via
``muscle_groups.classify`` — the finer read declines to fabricate a single muscle it cannot
name, the same restraint the group roll-up shows for an unmapped muscle.

Pure and dependency-free like ``muscle_groups`` and ``progression``: no ORM, no HTTP. The
mapping is curated data, not an AI call per read; the human labels are the enum values."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Protocol

from app.domain.muscle_groups import (
    REAL_GROUPS,
    ContributingExercise,
    MuscleGroup,
    classify,
    emphasis_of,
    normalize_muscle,
    rank_exercises,
    sessions_in_window,
)


class Muscle(str, Enum):
    """One curated, canonical individual muscle nesting under a single Muscle Group.

    The value is the human-facing anatomical label the Muscle Atlas will render. The
    ``str`` base lets a muscle serialize to its label without extra plumbing, exactly like
    :class:`~app.domain.muscle_groups.MuscleGroup`. ``UNCLASSIFIED`` is the explicit
    leftovers bucket a free-form string that names no known muscle falls into — shown,
    never dropped — mirroring the group tier's Unclassified.
    """

    # Legs
    QUADRICEPS = "Quadriceps"
    HAMSTRINGS = "Hamstrings"
    GLUTEUS_MAXIMUS = "Gluteus Maximus"
    GLUTEUS_MEDIUS = "Gluteus Medius"
    GLUTEUS_MINIMUS = "Gluteus Minimus"
    TENSOR_FASCIAE_LATAE = "Tensor Fasciae Latae"
    HIP_ADDUCTORS = "Hip Adductors"
    HIP_ABDUCTORS = "Hip Abductors"
    HIP_FLEXORS = "Hip Flexors"
    SARTORIUS = "Sartorius"
    GASTROCNEMIUS = "Gastrocnemius"
    SOLEUS = "Soleus"
    TIBIALIS_ANTERIOR = "Tibialis Anterior"
    PERONEALS = "Peroneals"
    # Chest
    PECTORALIS_MAJOR = "Pectoralis Major"
    PECTORALIS_MINOR = "Pectoralis Minor"
    SERRATUS_ANTERIOR = "Serratus Anterior"
    # Back
    LATISSIMUS_DORSI = "Latissimus Dorsi"
    TRAPEZIUS = "Trapezius"
    RHOMBOIDS = "Rhomboids"
    ERECTOR_SPINAE = "Erector Spinae"
    TERES_MAJOR = "Teres Major"
    TERES_MINOR = "Teres Minor"
    INFRASPINATUS = "Infraspinatus"
    LEVATOR_SCAPULAE = "Levator Scapulae"
    # Shoulders
    DELTOIDS = "Deltoids"
    SUPRASPINATUS = "Supraspinatus"
    ROTATOR_CUFF = "Rotator Cuff"
    # Arms
    BICEPS_BRACHII = "Biceps Brachii"
    TRICEPS_BRACHII = "Triceps Brachii"
    BRACHIALIS = "Brachialis"
    BRACHIORADIALIS = "Brachioradialis"
    CORACOBRACHIALIS = "Coracobrachialis"
    ANCONEUS = "Anconeus"
    FOREARMS = "Forearms"
    # Core
    RECTUS_ABDOMINIS = "Rectus Abdominis"
    OBLIQUES = "Obliques"
    TRANSVERSE_ABDOMINIS = "Transverse Abdominis"
    QUADRATUS_LUMBORUM = "Quadratus Lumborum"
    MULTIFIDUS = "Multifidus"
    # Leftovers
    UNCLASSIFIED = "Unclassified"


# Each canonical Muscle's parent Muscle Group — the single source of the muscle→group
# nesting the Atlas reads, kept exhaustive over :class:`Muscle` (asserted by a completeness
# test). ``UNCLASSIFIED`` nests under the group tier's own ``UNCLASSIFIED`` so the map stays
# total, exactly as ``muscle_groups.classify`` returns ``MuscleGroup.UNCLASSIFIED`` for an
# unmapped muscle — the two Unclassified buckets line up.
MUSCLE_TO_GROUP: dict[Muscle, MuscleGroup] = {
    # Legs
    Muscle.QUADRICEPS: MuscleGroup.LEGS,
    Muscle.HAMSTRINGS: MuscleGroup.LEGS,
    Muscle.GLUTEUS_MAXIMUS: MuscleGroup.LEGS,
    Muscle.GLUTEUS_MEDIUS: MuscleGroup.LEGS,
    Muscle.GLUTEUS_MINIMUS: MuscleGroup.LEGS,
    Muscle.TENSOR_FASCIAE_LATAE: MuscleGroup.LEGS,
    Muscle.HIP_ADDUCTORS: MuscleGroup.LEGS,
    Muscle.HIP_ABDUCTORS: MuscleGroup.LEGS,
    Muscle.HIP_FLEXORS: MuscleGroup.LEGS,
    Muscle.SARTORIUS: MuscleGroup.LEGS,
    Muscle.GASTROCNEMIUS: MuscleGroup.LEGS,
    Muscle.SOLEUS: MuscleGroup.LEGS,
    Muscle.TIBIALIS_ANTERIOR: MuscleGroup.LEGS,
    Muscle.PERONEALS: MuscleGroup.LEGS,
    # Chest
    Muscle.PECTORALIS_MAJOR: MuscleGroup.CHEST,
    Muscle.PECTORALIS_MINOR: MuscleGroup.CHEST,
    Muscle.SERRATUS_ANTERIOR: MuscleGroup.CHEST,
    # Back
    Muscle.LATISSIMUS_DORSI: MuscleGroup.BACK,
    Muscle.TRAPEZIUS: MuscleGroup.BACK,
    Muscle.RHOMBOIDS: MuscleGroup.BACK,
    Muscle.ERECTOR_SPINAE: MuscleGroup.BACK,
    Muscle.TERES_MAJOR: MuscleGroup.BACK,
    Muscle.TERES_MINOR: MuscleGroup.BACK,
    Muscle.INFRASPINATUS: MuscleGroup.BACK,
    Muscle.LEVATOR_SCAPULAE: MuscleGroup.BACK,
    # Shoulders
    Muscle.DELTOIDS: MuscleGroup.SHOULDERS,
    Muscle.SUPRASPINATUS: MuscleGroup.SHOULDERS,
    Muscle.ROTATOR_CUFF: MuscleGroup.SHOULDERS,
    # Arms
    Muscle.BICEPS_BRACHII: MuscleGroup.ARMS,
    Muscle.TRICEPS_BRACHII: MuscleGroup.ARMS,
    Muscle.BRACHIALIS: MuscleGroup.ARMS,
    Muscle.BRACHIORADIALIS: MuscleGroup.ARMS,
    Muscle.CORACOBRACHIALIS: MuscleGroup.ARMS,
    Muscle.ANCONEUS: MuscleGroup.ARMS,
    Muscle.FOREARMS: MuscleGroup.ARMS,
    # Core
    Muscle.RECTUS_ABDOMINIS: MuscleGroup.CORE,
    Muscle.OBLIQUES: MuscleGroup.CORE,
    Muscle.TRANSVERSE_ABDOMINIS: MuscleGroup.CORE,
    Muscle.QUADRATUS_LUMBORUM: MuscleGroup.CORE,
    Muscle.MULTIFIDUS: MuscleGroup.CORE,
    # Leftovers
    Muscle.UNCLASSIFIED: MuscleGroup.UNCLASSIFIED,
}


# Curated map from a normalized free-form muscle to its canonical Muscle. Mirrors
# ``muscle_groups._MUSCLE_TO_GROUP`` term-for-term where a string names an individual muscle
# (so ``MUSCLE_TO_GROUP[classify_muscle(term)] == classify(term)`` holds — asserted by a
# consistency test), and adds synonyms for the finer muscles the group map had no need to
# name. A *bare region* term ("back", "shoulders", "core", "deltoids") is deliberately absent
# — it names a group, not one muscle — and so falls through to Unclassified at this tier.
_FREEFORM_TO_MUSCLE: dict[str, Muscle] = {
    # Legs
    "quadriceps": Muscle.QUADRICEPS,
    "quadriceps femoris": Muscle.QUADRICEPS,
    "quads": Muscle.QUADRICEPS,
    "quad": Muscle.QUADRICEPS,
    "hamstrings": Muscle.HAMSTRINGS,
    "hamstring": Muscle.HAMSTRINGS,
    "hams": Muscle.HAMSTRINGS,
    "glutes": Muscle.GLUTEUS_MAXIMUS,
    "glute": Muscle.GLUTEUS_MAXIMUS,
    "gluteus": Muscle.GLUTEUS_MAXIMUS,
    "gluteus maximus": Muscle.GLUTEUS_MAXIMUS,
    "gluteus medius": Muscle.GLUTEUS_MEDIUS,
    "gluteus minimus": Muscle.GLUTEUS_MINIMUS,
    "tensor fasciae latae": Muscle.TENSOR_FASCIAE_LATAE,
    "tfl": Muscle.TENSOR_FASCIAE_LATAE,
    "adductors": Muscle.HIP_ADDUCTORS,
    "adductor": Muscle.HIP_ADDUCTORS,
    "hip adductors": Muscle.HIP_ADDUCTORS,
    "abductors": Muscle.HIP_ABDUCTORS,
    "abductor": Muscle.HIP_ABDUCTORS,
    "hip abductors": Muscle.HIP_ABDUCTORS,
    "hip flexors": Muscle.HIP_FLEXORS,
    "hip flexor": Muscle.HIP_FLEXORS,
    "sartorius": Muscle.SARTORIUS,
    "calves": Muscle.GASTROCNEMIUS,
    "calf": Muscle.GASTROCNEMIUS,
    "gastrocnemius": Muscle.GASTROCNEMIUS,
    "soleus": Muscle.SOLEUS,
    "tibialis anterior": Muscle.TIBIALIS_ANTERIOR,
    "tibialis": Muscle.TIBIALIS_ANTERIOR,
    "shins": Muscle.TIBIALIS_ANTERIOR,
    "peroneals": Muscle.PERONEALS,
    "fibularis": Muscle.PERONEALS,
    # Chest
    "chest": Muscle.PECTORALIS_MAJOR,
    "pectorals": Muscle.PECTORALIS_MAJOR,
    "pectoral": Muscle.PECTORALIS_MAJOR,
    "pecs": Muscle.PECTORALIS_MAJOR,
    "pectoralis": Muscle.PECTORALIS_MAJOR,
    "pectoralis major": Muscle.PECTORALIS_MAJOR,
    "pectoralis minor": Muscle.PECTORALIS_MINOR,
    "serratus anterior": Muscle.SERRATUS_ANTERIOR,
    "serratus": Muscle.SERRATUS_ANTERIOR,
    # Back
    "lats": Muscle.LATISSIMUS_DORSI,
    "lat": Muscle.LATISSIMUS_DORSI,
    "latissimus dorsi": Muscle.LATISSIMUS_DORSI,
    "trapezius": Muscle.TRAPEZIUS,
    "traps": Muscle.TRAPEZIUS,
    "trap": Muscle.TRAPEZIUS,
    "rhomboids": Muscle.RHOMBOIDS,
    "rhomboid": Muscle.RHOMBOIDS,
    "erector spinae": Muscle.ERECTOR_SPINAE,
    "lower back": Muscle.ERECTOR_SPINAE,
    "teres major": Muscle.TERES_MAJOR,
    "teres minor": Muscle.TERES_MINOR,
    "infraspinatus": Muscle.INFRASPINATUS,
    "levator scapulae": Muscle.LEVATOR_SCAPULAE,
    # Shoulders
    "front delts": Muscle.DELTOIDS,
    "rear delts": Muscle.DELTOIDS,
    "side delts": Muscle.DELTOIDS,
    "anterior deltoid": Muscle.DELTOIDS,
    "lateral deltoid": Muscle.DELTOIDS,
    "posterior deltoid": Muscle.DELTOIDS,
    "supraspinatus": Muscle.SUPRASPINATUS,
    "rotator cuff": Muscle.ROTATOR_CUFF,
    # Arms
    "biceps": Muscle.BICEPS_BRACHII,
    "bicep": Muscle.BICEPS_BRACHII,
    "biceps brachii": Muscle.BICEPS_BRACHII,
    "triceps": Muscle.TRICEPS_BRACHII,
    "tricep": Muscle.TRICEPS_BRACHII,
    "triceps brachii": Muscle.TRICEPS_BRACHII,
    "brachialis": Muscle.BRACHIALIS,
    "brachioradialis": Muscle.BRACHIORADIALIS,
    "coracobrachialis": Muscle.CORACOBRACHIALIS,
    "anconeus": Muscle.ANCONEUS,
    "forearms": Muscle.FOREARMS,
    "forearm": Muscle.FOREARMS,
    # Core
    "abs": Muscle.RECTUS_ABDOMINIS,
    "ab": Muscle.RECTUS_ABDOMINIS,
    "abdominals": Muscle.RECTUS_ABDOMINIS,
    "rectus abdominis": Muscle.RECTUS_ABDOMINIS,
    "obliques": Muscle.OBLIQUES,
    "oblique": Muscle.OBLIQUES,
    "transverse abdominis": Muscle.TRANSVERSE_ABDOMINIS,
    "quadratus lumborum": Muscle.QUADRATUS_LUMBORUM,
    "ql": Muscle.QUADRATUS_LUMBORUM,
    "multifidus": Muscle.MULTIFIDUS,
}


def classify_muscle(muscle: str) -> Muscle:
    """Resolve a single free-form muscle to its curated canonical :class:`Muscle`.

    Matching is case- and whitespace-insensitive, normalized by the very same
    ``muscle_groups.normalize_muscle`` the group roll-up uses, so the two tiers can never
    disagree on a lookup key. A string with no curated entry — unknown, AI-invented, or a
    bare region term that names a group rather than one muscle — returns
    :data:`Muscle.UNCLASSIFIED`, never dropped and never guessed at, mirroring
    ``muscle_groups.classify``.
    """

    return _FREEFORM_TO_MUSCLE.get(normalize_muscle(muscle), Muscle.UNCLASSIFIED)


def group_of(muscle: Muscle) -> MuscleGroup:
    """The Muscle Group a canonical :class:`Muscle` nests under (total over ``Muscle``).

    The one read of the muscle→group nesting: callers roll a Muscle up to its parent
    group through here rather than reaching into ``MUSCLE_TO_GROUP`` at each site, so the
    six-group roll-up keeps working unchanged on top of the finer vocabulary."""

    return MUSCLE_TO_GROUP[muscle]


# The real (non-leftovers) muscles in canonical order — the enum's own definition order,
# which is already grouped by body region (Legs, Chest, Back, Shoulders, Arms, Core) exactly
# as ``muscle_groups.GROUP_ORDER`` runs. The fixed roster the per-muscle read reports on;
# Unclassified is never one of them and never a coverage target (ADR-0025), mirroring how the
# group roll-up drops it from ``REAL_GROUPS``.
MUSCLE_ORDER: tuple[Muscle, ...] = tuple(
    muscle for muscle in Muscle if muscle is not Muscle.UNCLASSIFIED
)

# Each real Muscle Group's canonical muscles, in ``MUSCLE_ORDER``. The roster a *coarse*
# group-level term (e.g. "back") spreads its weight across, so a set that names only a group
# lights every muscle nested under it rather than leaving the map a sea of grey — and sharpens
# automatically wherever the data instead names a specific muscle. Derived from
# ``MUSCLE_TO_GROUP`` so it can never drift from the nesting.
MUSCLES_IN_GROUP: dict[MuscleGroup, tuple[Muscle, ...]] = {
    group: tuple(
        muscle for muscle in MUSCLE_ORDER if MUSCLE_TO_GROUP[muscle] is group
    )
    for group in REAL_GROUPS
}

# Emphasis weights behind the per-muscle heat (ADR-0016): a set's prime movers read at full
# weight, its assistors at a fraction, so an isolation set's target reads hotter than a
# compound's incidental helpers. Named, not magic — the fraction is the one knob the heat
# model exposes. The "no asserted split → all primary" fallback lives in ``emphasis_of``, so a
# split-less set contributes every muscle at full weight rather than vanishing.
PRIMARY_EMPHASIS_WEIGHT = 1.0
SECONDARY_EMPHASIS_WEIGHT = 0.5


class _EmphasisNamedSet(Protocol):
    """A Logged Set carrying the Primary/Secondary emphasis split (ADR-0016) and its Exercise
    name — the shape the per-muscle read needs to weight each muscle and attribute it back to
    the exercises behind it. ``primary_muscles`` / ``secondary_muscles`` / ``targeted_muscles``
    feed ``muscle_groups.emphasis_of``; ``exercise_name`` rides on the same denormalized view
    the group roll-up already reads."""

    targeted_muscles: Sequence[str]
    primary_muscles: Sequence[str]
    secondary_muscles: Sequence[str]
    exercise_name: str


class _MuscleCoverageSession(Protocol):
    """A dated Logged Session whose sets carry emphasis and their Exercise name — the input
    :func:`recent_muscle_coverage` reads over the fixed coverage window."""

    performed_on: date
    logged_sets: Sequence[_EmphasisNamedSet]


@dataclass(frozen=True)
class MuscleCoverage:
    """One canonical :class:`Muscle`'s presence and emphasis-weighted volume over the window.

    ``present`` is ``True`` iff the muscle received any in-window weight (equivalently,
    ``volume > 0``) — presence, never a threshold or a target (ADR-0025). ``volume`` is the
    emphasis-weighted in-window contribution: each set adds :data:`PRIMARY_EMPHASIS_WEIGHT`
    per primary muscle and :data:`SECONDARY_EMPHASIS_WEIGHT` per secondary, with a coarse
    group-level term's weight spread evenly across the muscles nested under its group. It is a
    heat magnitude, not a kg total and not a rank. ``contributing_exercises`` names the
    exercises whose in-window sets trained the muscle, most sets first — so a lit muscle
    explains its heat rather than asserting a bare glow. Frozen and value-typed, mirroring
    :class:`~app.domain.muscle_groups.GroupCoverage`."""

    muscle: Muscle
    group: MuscleGroup
    present: bool
    volume: float
    contributing_exercises: tuple[ContributingExercise, ...]


@dataclass(frozen=True)
class RecentMuscleCoverage:
    """The finer per-muscle tier of the Muscle Atlas coverage read (ADR-0073/0078).

    ``muscles`` is every real :class:`Muscle` in canonical order, each with its presence,
    emphasis-weighted volume, and contributing exercises — the heat the anatomical body map
    shades. It rolls up consistently to the six-group :class:`~app.domain.muscle_groups.\
RecentCoverage`: a muscle is present only where its parent group is covered, and every covered
    group has at least one present muscle (the coarse-data spread guarantees it), so the map and
    its group roll-up can never disagree. ``unclassified_present`` /``unclassified_volume``
    disclose in-window emphasis weight that names no known muscle *and* no known group (truly
    off-map work) — the per-muscle twin of the group tier's Unclassified footnote, disclosed and
    never dropped, never a body region and never a target. Frozen and value-typed like the group
    read."""

    muscles: tuple[MuscleCoverage, ...]
    unclassified_present: bool
    unclassified_volume: float


def _resolve_targets(muscle: str) -> tuple[Muscle, ...] | None:
    """Which canonical Muscles a single free-form string credits with weight — or ``None``.

    The **group tier is the source of truth** for what is on the map: the string is first
    rolled up via ``muscle_groups.classify``, and only weight the group tier can place lands on
    a muscle. This is what keeps the finer read from ever contradicting the six-group roll-up —
    a muscle is lit only inside a group the roll-up also covers, and the two tiers' Unclassified
    buckets line up exactly (the group read leaves ``coverage`` unchanged, ADR-0025):

    - The group tier can't place it (``classify`` is Unclassified — unknown, AI-invented, blank,
      or a fine-only alias like "supraspinatus" the coarse map doesn't carry) → ``None``, truly
      off-map, disclosed as Unclassified rather than guessed at, never lighting a region the map
      leaves dark.
    - The string names a specific muscle whose parent group is the very group it rolled up to
      (the ADR-0078 no-contradiction invariant guarantees this wherever both classify) → that
      one Muscle, the map sharpened onto it.
    - Otherwise it is a *coarse* group-level term ("back", "shoulders") that rolls up to a group
      but names no single muscle → its weight spreads evenly across every muscle nested under
      that group (:data:`MUSCLES_IN_GROUP`), so a covered group is never a sea of grey and
      sharpens automatically wherever the data instead names a specific muscle.
    """

    group = classify(muscle)
    if group is MuscleGroup.UNCLASSIFIED:
        return None
    resolved = classify_muscle(muscle)
    if resolved is not Muscle.UNCLASSIFIED and group_of(resolved) is group:
        return (resolved,)
    return MUSCLES_IN_GROUP[group]


def _set_contributions(logged_set: _EmphasisNamedSet) -> tuple[dict[Muscle, float], float]:
    """One Logged Set's emphasis-weighted contribution per canonical Muscle, plus its off-map
    weight.

    **The flat ``targeted_muscles`` union decides what is on the map; the Primary/Secondary
    emphasis only scales the heat.** Presence is driven off the *same* field the six-group
    roll-up reads (``muscle_groups.covered_groups`` / ``_groups_for_set`` also walk
    ``targeted_muscles``), so a muscle lights only where its group is covered and every covered
    group has a lit muscle — the "can never disagree" guarantee holds *by construction*, not by
    assuming the split mirrors the union (ADR-0016 stores the two as independent fields, so the
    per-muscle read must not depend on their alignment).

    Each targeted muscle string is weighted by its role in the set's emphasis (``emphasis_of``,
    with its "no split → all primary" fallback): :data:`SECONDARY_EMPHASIS_WEIGHT` when the split
    names it a secondary assistor, else :data:`PRIMARY_EMPHASIS_WEIGHT` — so a prime mover reads
    hotter than an assistor, and a muscle an incomplete split names in neither list defaults to
    full weight rather than having its presence suppressed. A coarse group-level term's weight
    spreads evenly across its group (:func:`_resolve_targets`); weight the group tier can't place
    is returned separately as the set's off-map (Unclassified) contribution. Pure — it mutates
    nothing the caller owns."""

    emphasis = emphasis_of(logged_set)
    secondary = {normalize_muscle(muscle) for muscle in emphasis.secondary}
    primary = {normalize_muscle(muscle) for muscle in emphasis.primary}
    contribution: dict[Muscle, float] = {}
    unclassified = 0.0
    for muscle_str in logged_set.targeted_muscles:
        key = normalize_muscle(muscle_str)
        weight = (
            SECONDARY_EMPHASIS_WEIGHT
            if key in secondary and key not in primary
            else PRIMARY_EMPHASIS_WEIGHT
        )
        targets = _resolve_targets(muscle_str)
        if targets is None:
            unclassified += weight
            continue
        share = weight / len(targets)
        for muscle in targets:
            contribution[muscle] = contribution.get(muscle, 0.0) + share
    return contribution, unclassified


def recent_muscle_coverage(
    history: Iterable[_MuscleCoverageSession], *, reference: date, weeks: int
) -> RecentMuscleCoverage:
    """Report each canonical Muscle's presence, emphasis-weighted volume, and exercises.

    Reads the **same** fixed window as the six-group :func:`~app.domain.muscle_groups.\
recent_coverage` — the ``weeks`` weeks ending at ``reference``'s week, via the shared
    :func:`~app.domain.muscle_groups.sessions_in_window`, so the finer tier can never disagree
    with the roll-up on how far back "recent" reaches (ADR-0025). Presence is driven off each
    set's flat ``targeted_muscles`` union — the same field the six-group roll-up reads — while
    the Primary/Secondary emphasis (``emphasis_of``, with its "no split → all primary" fallback)
    only scales the heat: :data:`PRIMARY_EMPHASIS_WEIGHT` for a prime mover,
    :data:`SECONDARY_EMPHASIS_WEIGHT` for an assistor, with a coarse group-level term's weight
    spread evenly across the muscles nested under its group so the map sharpens automatically as
    the data names specific muscles.

    Every real Muscle is returned in canonical order (Unclassified is never a row), each carrying
    whether it was trained, its accumulated heat, and the exercises behind it (most sets first,
    an exercise counted once per in-window set that trained the muscle). Weight that names
    neither a muscle nor a group is disclosed via ``unclassified_present`` /
    ``unclassified_volume`` — never folded into a real muscle, never dropped. An empty or wholly
    out-of-window history reads every muscle absent with zero volume, the honest "nothing recent"
    state.
    """

    windowed = sessions_in_window(history, reference=reference, weeks=weeks)

    volume: dict[Muscle, float] = {muscle: 0.0 for muscle in MUSCLE_ORDER}
    exercise_tally: dict[Muscle, dict[str, int]] = {muscle: {} for muscle in MUSCLE_ORDER}
    unclassified_volume = 0.0

    for session in windowed:
        for logged_set in session.logged_sets:
            contribution, off_map = _set_contributions(logged_set)
            unclassified_volume += off_map
            name = logged_set.exercise_name
            for muscle, weight in contribution.items():
                volume[muscle] += weight
                # An exercise is credited once per set that trained the muscle — the
                # contribution's keys are exactly the distinct muscles this set touched.
                exercise_tally[muscle][name] = exercise_tally[muscle].get(name, 0) + 1

    return RecentMuscleCoverage(
        muscles=tuple(
            MuscleCoverage(
                muscle=muscle,
                group=group_of(muscle),
                present=volume[muscle] > 0.0,
                volume=volume[muscle],
                contributing_exercises=rank_exercises(exercise_tally[muscle]),
            )
            for muscle in MUSCLE_ORDER
        ),
        unclassified_present=unclassified_volume > 0.0,
        unclassified_volume=unclassified_volume,
    )


__all__ = [
    "Muscle",
    "MUSCLE_TO_GROUP",
    "MUSCLE_ORDER",
    "MUSCLES_IN_GROUP",
    "PRIMARY_EMPHASIS_WEIGHT",
    "SECONDARY_EMPHASIS_WEIGHT",
    "MuscleCoverage",
    "RecentMuscleCoverage",
    "classify_muscle",
    "group_of",
    "recent_muscle_coverage",
]
