"""Substitution resolution rules — lookup-first over the catalog.

A Substitution swaps one Exercise Prescription's Exercise for a Variation (same
movement, scaled) or Alternative (same effect) within the user's own Session copy
(CONTEXT.md). Resolution is **lookup-first**: ``resolve_substitute`` filters the
typed catalog relationships by the user's equipment and constraints and returns a
compatible match when one exists, falling back to AI generation only when none
fits. This module is the deterministic, no-AI core of that flow."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class RelationKind(str, Enum):
    """The typed relationship between two catalog Exercises (CONTEXT.md).

    A Variation is the *same* movement pattern scaled in difficulty; an
    Alternative achieves a *similar* training effect with a different movement."""

    VARIATION = "variation"
    ALTERNATIVE = "alternative"


@dataclass(frozen=True)
class SubstituteCandidate:
    """A catalog Exercise linked to the prescribed one, considered as a swap.

    Carries the relationship ``kind`` and the catalog facts the rule filters on:
    the equipment the movement requires and the constraint tags it conflicts with.
    ``difficulty`` (the catalog's 1–10 rating) is what the harder-Variation resolver
    orders on; ``None`` means unrated, so a candidate cannot be confirmed harder."""

    exercise_id: int
    name: str
    kind: RelationKind
    required_equipment: tuple[str, ...] = ()
    contraindications: tuple[str, ...] = ()
    difficulty: int | None = None


@dataclass(frozen=True)
class SubstitutionContext:
    """The user-side filters for resolution: what they have and must avoid.

    ``goal`` is carried for the AI-fallback prompt; the hard filter is equipment
    and constraints."""

    available_equipment: frozenset[str] = frozenset()
    constraints: frozenset[str] = frozenset()
    goal: str | None = None


@dataclass(frozen=True)
class SubstituteResolution:
    """The outcome of resolution: a chosen candidate, or an AI-fallback signal."""

    candidate: SubstituteCandidate | None
    needs_ai_fallback: bool


def resolve_substitute(
    candidates: list[SubstituteCandidate],
    context: SubstitutionContext,
) -> SubstituteResolution:
    """Pick a catalog substitute compatible with the user's equipment, or signal
    that AI generation is required when none fits."""

    compatible = compatible_candidates(candidates, context)
    if not compatible:
        return SubstituteResolution(candidate=None, needs_ai_fallback=True)
    # A Variation is the same movement scaled, so it is the closer swap; among a
    # kind, the catalog's own order is preserved (a stable sort).
    chosen = min(compatible, key=lambda c: _PREFERENCE[c.kind])
    return SubstituteResolution(candidate=chosen, needs_ai_fallback=False)


_PREFERENCE = {RelationKind.VARIATION: 0, RelationKind.ALTERNATIVE: 1}


def next_harder_variation(
    current_difficulty: int | None,
    candidates: list[SubstituteCandidate],
) -> SubstituteCandidate | None:
    """The next harder Variation to progress into, or ``None`` to hold (ADR-0026).

    Progression by difficulty is one honest step up: among the catalog Variations of
    the current movement (Alternatives are a *different* movement, never a harder
    version of this one), pick the rated Variation with the smallest difficulty that
    is strictly greater than the current movement's. Returns ``None`` when the current
    movement is unrated (no baseline to beat) or nothing rated is strictly harder — the
    honest ceiling, where the prescription simply holds. Pass ``candidates`` already
    filtered by ``compatible_candidates`` so an offer respects the user's equipment and
    constraints (ADR-0003); this resolver only orders the compatible set by difficulty.
    """

    if current_difficulty is None:
        return None
    harder = [
        candidate
        for candidate in candidates
        if candidate.kind is RelationKind.VARIATION
        and candidate.difficulty is not None
        and candidate.difficulty > current_difficulty
    ]
    if not harder:
        return None
    return min(harder, key=lambda candidate: candidate.difficulty)


def compatible_candidates(
    candidates: list[SubstituteCandidate], context: SubstitutionContext
) -> list[SubstituteCandidate]:
    """The candidates the user can actually take: equipment they own and no
    constraint collision. The shared filter behind both ``resolve_substitute`` and
    the harder-Variation offer, so a contraindicated movement is ruled out once."""

    return [candidate for candidate in candidates if _is_compatible(candidate, context)]


def _is_compatible(
    candidate: SubstituteCandidate, context: SubstitutionContext
) -> bool:
    """A candidate fits when the user owns its equipment and none of its
    contraindications collide with the user's constraints."""

    equipment_available = (
        set(candidate.required_equipment) <= context.available_equipment
    )
    constraint_free = set(candidate.contraindications).isdisjoint(context.constraints)
    return equipment_available and constraint_free


__all__ = [
    "RelationKind",
    "SubstituteCandidate",
    "SubstitutionContext",
    "SubstituteResolution",
    "resolve_substitute",
    "compatible_candidates",
    "next_harder_variation",
]
