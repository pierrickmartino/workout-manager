"""Muscle Groups — the curated roll-up behind the Analytics muscle distribution.

An Exercise's ``targeted_muscles`` is a free-form string list kept as the durable
analytics-facing union (ADR-0016, amending ADR-0011): the Primary/Secondary emphasis
split lives in separate fields and does not touch this roll-up. This module rolls
those union muscles into six coarse, **curated** Muscle Groups — Legs, Chest, Back,
Shoulders, Arms, Core —
with an explicit **Unclassified** bucket for anything with no known mapping.
Unclassified is shown, never dropped: an unmapped or AI-invented muscle stays
visible rather than silently vanishing.

``distribution`` turns a user's history into ``{group: pct}`` weighted by **set
count**, with each Logged Set split **evenly across the distinct groups** its
Exercise maps to. It is purely set-count based — no Load, no Estimated 1RM — so a
single heavy lift can't dominate the split, and the percentages sum to 100.

Pure and dependency-free (like ``domain/progression.py``): no ORM, no HTTP. The
mapping is curated data, not an AI call per read."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from enum import Enum
from typing import Protocol

_WHITESPACE = re.compile(r"\s+")


class MuscleGroup(str, Enum):
    """A coarse, curated bucket a free-form targeted muscle rolls up into.

    The value is the human-facing label rendered on the Analytics screen. The
    ``str`` base lets a group serialize to its label without extra plumbing.
    """

    LEGS = "Legs"
    CHEST = "Chest"
    BACK = "Back"
    SHOULDERS = "Shoulders"
    ARMS = "Arms"
    CORE = "Core"
    UNCLASSIFIED = "Unclassified"


# Canonical presentation order: the six real groups in a stable body order, with
# Unclassified always last so the "leftovers" bucket reads as a footnote, not a peer.
GROUP_ORDER: tuple[MuscleGroup, ...] = (
    MuscleGroup.LEGS,
    MuscleGroup.CHEST,
    MuscleGroup.BACK,
    MuscleGroup.SHOULDERS,
    MuscleGroup.ARMS,
    MuscleGroup.CORE,
    MuscleGroup.UNCLASSIFIED,
)

# Curated map from a normalized free-form muscle to its Muscle Group. Kept as data
# (not heuristics) so the roll-up is auditable and deterministic. Common synonyms
# and the plural/singular the catalog tends to emit are listed explicitly; anything
# absent falls through to Unclassified rather than being guessed at.
_MUSCLE_TO_GROUP: dict[str, MuscleGroup] = {
    # Legs
    "quadriceps": MuscleGroup.LEGS,
    "quadriceps femoris": MuscleGroup.LEGS,
    "quads": MuscleGroup.LEGS,
    "quad": MuscleGroup.LEGS,
    "hamstrings": MuscleGroup.LEGS,
    "hamstring": MuscleGroup.LEGS,
    "glutes": MuscleGroup.LEGS,
    "glute": MuscleGroup.LEGS,
    "gluteus": MuscleGroup.LEGS,
    "gluteus maximus": MuscleGroup.LEGS,
    "gluteus medius": MuscleGroup.LEGS,
    "calves": MuscleGroup.LEGS,
    "calf": MuscleGroup.LEGS,
    "gastrocnemius": MuscleGroup.LEGS,
    "soleus": MuscleGroup.LEGS,
    "adductors": MuscleGroup.LEGS,
    "adductor": MuscleGroup.LEGS,
    "abductors": MuscleGroup.LEGS,
    "abductor": MuscleGroup.LEGS,
    "hip flexors": MuscleGroup.LEGS,
    "hip flexor": MuscleGroup.LEGS,
    # Chest
    "chest": MuscleGroup.CHEST,
    "pectorals": MuscleGroup.CHEST,
    "pectoral": MuscleGroup.CHEST,
    "pecs": MuscleGroup.CHEST,
    "pectoralis": MuscleGroup.CHEST,
    "pectoralis major": MuscleGroup.CHEST,
    "pectoralis minor": MuscleGroup.CHEST,
    # Back
    "back": MuscleGroup.BACK,
    "upper back": MuscleGroup.BACK,
    "lower back": MuscleGroup.BACK,
    "lats": MuscleGroup.BACK,
    "lat": MuscleGroup.BACK,
    "latissimus dorsi": MuscleGroup.BACK,
    "trapezius": MuscleGroup.BACK,
    "traps": MuscleGroup.BACK,
    "trap": MuscleGroup.BACK,
    "rhomboids": MuscleGroup.BACK,
    "rhomboid": MuscleGroup.BACK,
    "erector spinae": MuscleGroup.BACK,
    "teres major": MuscleGroup.BACK,
    "teres minor": MuscleGroup.BACK,
    # Shoulders
    "shoulders": MuscleGroup.SHOULDERS,
    "shoulder": MuscleGroup.SHOULDERS,
    "deltoids": MuscleGroup.SHOULDERS,
    "deltoid": MuscleGroup.SHOULDERS,
    "delts": MuscleGroup.SHOULDERS,
    "delt": MuscleGroup.SHOULDERS,
    "front delts": MuscleGroup.SHOULDERS,
    "rear delts": MuscleGroup.SHOULDERS,
    "rotator cuff": MuscleGroup.SHOULDERS,
    # Arms
    "biceps": MuscleGroup.ARMS,
    "bicep": MuscleGroup.ARMS,
    "biceps brachii": MuscleGroup.ARMS,
    "triceps": MuscleGroup.ARMS,
    "tricep": MuscleGroup.ARMS,
    "triceps brachii": MuscleGroup.ARMS,
    "forearms": MuscleGroup.ARMS,
    "forearm": MuscleGroup.ARMS,
    "brachialis": MuscleGroup.ARMS,
    # Core
    "core": MuscleGroup.CORE,
    "abs": MuscleGroup.CORE,
    "ab": MuscleGroup.CORE,
    "abdominals": MuscleGroup.CORE,
    "rectus abdominis": MuscleGroup.CORE,
    "obliques": MuscleGroup.CORE,
    "oblique": MuscleGroup.CORE,
    "transverse abdominis": MuscleGroup.CORE,
}


class _LoggedSet(Protocol):
    targeted_muscles: Sequence[str]


class _LoggedSession(Protocol):
    logged_sets: Sequence[_LoggedSet]


def _normalize(muscle: str) -> str:
    """Canonical lookup key: lowercased, trimmed, internal whitespace collapsed."""

    return _WHITESPACE.sub(" ", muscle.strip()).lower()


def classify(muscle: str) -> MuscleGroup:
    """Roll a single free-form muscle up into its curated Muscle Group.

    Matching is case- and whitespace-insensitive. A muscle with no curated entry
    (unknown or AI-invented) returns ``UNCLASSIFIED`` — never dropped, never
    guessed at.
    """

    return _MUSCLE_TO_GROUP.get(_normalize(muscle), MuscleGroup.UNCLASSIFIED)


def _groups_for_set(logged_set: _LoggedSet) -> set[MuscleGroup]:
    """The distinct Muscle Groups one Logged Set's Exercise trains.

    An Exercise with no ``targeted_muscles`` recorded maps to nothing known, so it
    counts as a single Unclassified group — shown, never dropped.
    """

    groups = {classify(muscle) for muscle in logged_set.targeted_muscles}
    return groups or {MuscleGroup.UNCLASSIFIED}


def distribution(history: Iterable[_LoggedSession]) -> dict[MuscleGroup, float]:
    """Return the set-count muscle distribution as ``{group: pct}``.

    Every Logged Set carries one unit of weight, split **evenly across the distinct
    groups** its Exercise maps to (a set that trains two groups gives each a half).
    Weight is summed across the whole history and normalized to percentages that
    sum to 100. The result holds only the groups that received weight, in canonical
    ``GROUP_ORDER``; a history with no sets yields an empty distribution — the
    honest empty state, never an error.
    """

    weights: dict[MuscleGroup, float] = {}
    total = 0.0
    for session in history:
        for logged_set in session.logged_sets:
            groups = _groups_for_set(logged_set)
            share = 1.0 / len(groups)
            for group in groups:
                weights[group] = weights.get(group, 0.0) + share
            total += 1.0

    if total == 0.0:
        return {}

    return {
        group: weights[group] / total * 100.0
        for group in GROUP_ORDER
        if group in weights
    }


__all__ = [
    "MuscleGroup",
    "GROUP_ORDER",
    "classify",
    "distribution",
]
