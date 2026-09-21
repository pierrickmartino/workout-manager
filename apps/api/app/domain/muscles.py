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

from collections.abc import Iterable
from enum import Enum

from app.domain.muscle_groups import MuscleGroup, normalize_muscle


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


# The six real Muscle Groups in canonical body order, each with the curated canonical
# Muscles that nest under it — a presentation-ordered view derived from ``MUSCLE_TO_GROUP``
# for surfaces (the Atlas) that render muscles grouped under their region. Unclassified is
# never a real group, so it holds no muscles here.
MUSCLES_BY_GROUP: dict[MuscleGroup, tuple[Muscle, ...]] = {
    group: tuple(
        muscle
        for muscle in Muscle
        if muscle is not Muscle.UNCLASSIFIED and MUSCLE_TO_GROUP[muscle] is group
    )
    for group in MuscleGroup
    if group is not MuscleGroup.UNCLASSIFIED
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
    """The Muscle Group a canonical :class:`Muscle` nests under (total over ``Muscle``)."""

    return MUSCLE_TO_GROUP[muscle]


def canonical_muscles(values: Iterable[str]) -> list[Muscle]:
    """The distinct canonical Muscles a set of free-form strings rolls up into, ordered.

    Each string is classified, duplicates collapse (so "quads" and "quadriceps" read as one
    ``QUADRICEPS``), and the result is returned in :class:`Muscle` declaration order with
    ``UNCLASSIFIED`` last. Blank strings contribute nothing; anything unmapped surfaces as
    the single ``UNCLASSIFIED`` bucket — disclosed, never dropped, the finer-tier twin of
    ``muscle_groups`` keeping Unclassified visible.
    """

    present = {classify_muscle(value) for value in values if value.strip()}
    return [muscle for muscle in Muscle if muscle in present]


__all__ = [
    "Muscle",
    "MUSCLE_TO_GROUP",
    "MUSCLES_BY_GROUP",
    "classify_muscle",
    "group_of",
    "canonical_muscles",
]
