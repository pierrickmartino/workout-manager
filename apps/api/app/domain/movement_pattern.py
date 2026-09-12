"""Movement Pattern — the curated read-time bucket behind the Catalog field-guide taxonomy.

The **Browse the Catalog** taxonomy (ADR-0072) groups the shared Catalog by a broad,
curated **Movement Pattern** — Squat, Hinge, Push, Pull, Carry, Locomotion, Core — with a
**General** bucket for anything no pattern confidently fits. It gives the library visual
variety (one line illustration per pattern) without a bespoke drawing per movement.

Like Muscle Group (``app.domain.muscle_groups``) and Catalog Completeness, a Movement
Pattern is a **read-time projection** over an Exercise's existing fields — its name first,
its targeted muscles as a fallback — never a stored column and never an AI call per read.
Everything here is pure: no ORM, no HTTP.

Classification is name-keyword-first (the strongest signal), with a conservative
muscle-mix fallback, and **General** when neither is conclusive — a pattern is asserted
only when it accurately fits, never guessed at, mirroring how ``classify`` leaves an
unmapped muscle Unclassified rather than forcing it into a group."""

from __future__ import annotations

import re
from collections.abc import Sequence
from enum import Enum
from typing import Protocol

_WHITESPACE = re.compile(r"\s+")


class MovementPattern(str, Enum):
    """A broad, curated movement bucket an Exercise rolls up into.

    The value is the lowercase wire token; the human label (Squat, Hinge…) is a
    presentation concern owned by the frontend. ``GENERAL`` is the honest "no single
    pattern dominates" bucket — the pattern twin of Muscle Group's ``UNCLASSIFIED``.
    """

    SQUAT = "squat"
    HINGE = "hinge"
    PUSH = "push"
    PULL = "pull"
    CARRY = "carry"
    LOCOMOTION = "locomotion"
    CORE = "core"
    GENERAL = "general"


# Canonical presentation order: the seven real patterns in a stable order, with General
# always last so the "everything else" bucket reads as a footnote, not a peer.
PATTERN_ORDER: tuple[MovementPattern, ...] = (
    MovementPattern.SQUAT,
    MovementPattern.HINGE,
    MovementPattern.PUSH,
    MovementPattern.PULL,
    MovementPattern.CARRY,
    MovementPattern.LOCOMOTION,
    MovementPattern.CORE,
    MovementPattern.GENERAL,
)


class _Classifiable(Protocol):
    """The Exercise fields the classifier reads — its name and targeted muscles.

    Typed structurally so both the ORM row and any test double satisfy it, the same
    idiom as ``_Browsable`` in ``exercise_browse``.
    """

    name: str
    targeted_muscles: Sequence[str]


# Name-keyword tables, checked in this priority order. Order is load-bearing where a name
# could read two ways:
#   - Locomotion first, so "rowing"/"row erg" beats the "row" -> pull keyword.
#   - Carry next (its keywords are distinctive).
#   - Core before push/pull, so a distinctive core name ("Pallof Press", "Woodchop")
#     beats the generic "press"/"row" verb it happens to contain.
#   - Hinge before pull, so "power clean" (hip drive) reads as a hinge, not the pull it
#     finishes with.
_PATTERN_KEYWORDS: tuple[tuple[MovementPattern, tuple[str, ...]], ...] = (
    (
        MovementPattern.LOCOMOTION,
        (
            # No bare "walk"/"march": a farmer's *walk* is a carry and a walking *lunge*
            # is a squat, so those patterns' own keywords must win — cardio walking on a
            # machine is caught by "treadmill" instead.
            "run", "sprint", "jog", "treadmill", "rowing", "row erg", "row machine",
            "erg", "bike", "cycl", "spin", "elliptical", "ski erg", "skierg", "sled",
            "prowler", "crawl", "jump rope", "skip", "stair", "swim", "shuttle",
        ),
    ),
    (
        MovementPattern.CARRY,
        ("carry", "farmer", "suitcase", "waiter", "yoke", "loaded carry", "rack walk"),
    ),
    (
        MovementPattern.CORE,
        (
            "plank", "crunch", "sit-up", "situp", "sit up", "hollow", "dead bug",
            "deadbug", "russian twist", "leg raise", "knee raise", "pallof", "woodchop",
            "wood chop", "rotation", "anti-rotation", "mountain climber", "bicycle",
            "v-up", "v up", "flutter", "ab wheel", "ab rollout", "rollout", "toes to bar",
            "windmill",
        ),
    ),
    (
        MovementPattern.HINGE,
        (
            "deadlift", "hinge", "rdl", "romanian", "good morning", "hip thrust",
            "glute bridge", "kettlebell swing", "kb swing", "swing", "clean", "snatch",
            "back extension", "hyperextension", "pull-through", "pull through",
        ),
    ),
    (
        MovementPattern.SQUAT,
        (
            "squat", "lunge", "split squat", "step-up", "step up", "leg press", "pistol",
            "box squat", "goblet", "hack squat", "sissy", "bulgarian", "wall sit",
            "leg extension",
        ),
    ),
    (
        MovementPattern.PULL,
        (
            "pull-up", "pullup", "pull up", "chin-up", "chinup", "chin up", "row",
            "pulldown", "lat pull", "curl", "face pull", "shrug", "pullover", "rear delt",
            "reverse fly", "reverse flye", "dead hang", "deadhang", "inverted row",
        ),
    ),
    (
        MovementPattern.PUSH,
        (
            "press", "push-up", "pushup", "push up", "bench", "dip", "fly", "flye",
            "overhead", "incline", "decline", "chest", "tricep", "triceps",
            "skullcrusher", "skull crusher", "pushdown", "push-down", "jerk", "thruster",
            "kickback",
        ),
    ),
)

# Muscle-mix fallback when no name keyword matched — a weaker signal, so a hit here is an
# inference, not a named match. Keyed on lowercased substrings of muscle names, and kept
# conservative: only muscles that point cleanly at one pattern.
_MUSCLE_HINTS: tuple[tuple[MovementPattern, tuple[str, ...]], ...] = (
    (MovementPattern.CORE, ("abdominal", "abs", "oblique", "core", "transverse")),
    (MovementPattern.HINGE, ("hamstring", "glute", "erector", "lower back")),
    (MovementPattern.SQUAT, ("quadricep", "quad", "calf", "calves", "adductor")),
    (MovementPattern.PUSH, ("chest", "pectoral", "tricep", "front delt", "anterior delt")),
    (MovementPattern.PULL, ("lat", "latissimus", "bicep", "rhomboid", "trapezius", "rear delt")),
)


def _normalize(text: str) -> str:
    """Canonical match key: lowercased, trimmed, internal whitespace collapsed."""

    return _WHITESPACE.sub(" ", text.strip()).lower()


def classify_movement_pattern(exercise: _Classifiable) -> MovementPattern:
    """Classify one Exercise into its broad Movement Pattern (ADR-0072).

    Name keywords first (the confident signal); then a conservative muscle-mix fallback
    when the name carries no keyword; else :data:`MovementPattern.GENERAL`. A pattern is
    asserted only when it accurately fits — an unknown or ambiguous movement stays
    General rather than being forced into a family it does not belong to.
    """

    name = _normalize(exercise.name)
    for pattern, keywords in _PATTERN_KEYWORDS:
        if any(keyword in name for keyword in keywords):
            return pattern

    muscles = [_normalize(muscle) for muscle in exercise.targeted_muscles]
    scores: dict[MovementPattern, int] = {}
    for pattern, hints in _MUSCLE_HINTS:
        hits = sum(
            1 for muscle in muscles if any(hint in muscle for hint in hints)
        )
        if hits:
            scores[pattern] = hits

    if scores:
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        top_pattern, top_score = ranked[0]
        tie = len(ranked) > 1 and ranked[1][1] == top_score
        if not tie:
            return top_pattern

    return MovementPattern.GENERAL


def group_by_movement_pattern(
    exercises: Sequence[_Classifiable],
) -> list[tuple[MovementPattern, list[_Classifiable]]]:
    """Group Exercises by Movement Pattern, in canonical order, dropping empty patterns.

    Returns ``(pattern, members)`` pairs in :data:`PATTERN_ORDER` (General last), each
    holding only the Exercises that classify into it, in their **input order** (the caller
    ranks the input first, so within-pattern ranking is preserved). Patterns with no
    members are omitted, so the taxonomy never shows an empty section.
    """

    buckets: dict[MovementPattern, list[_Classifiable]] = {}
    for exercise in exercises:
        buckets.setdefault(classify_movement_pattern(exercise), []).append(exercise)

    return [(pattern, buckets[pattern]) for pattern in PATTERN_ORDER if pattern in buckets]


__all__ = [
    "MovementPattern",
    "PATTERN_ORDER",
    "classify_movement_pattern",
    "group_by_movement_pattern",
]
