"""Catalog browse — filtering and ordering the whole Exercise Catalog for discovery.

The **Browse the Catalog** surface (ADR-0042) lists the *whole* Catalog — Stubs and
unvalidated entries included — narrowed by curated **Muscle Group**, required
**equipment**, and a coarse **difficulty band**, and ordered so trustworthy, complete
movements lead. Everything here is pure: no ORM, no HTTP. The repository calls these to
page the Catalog (``browse``); the curated Muscle-Group roll-up stays the one in
``app.domain.muscle_groups`` (``classify``), never re-implemented in SQL.

The three facets combine with **AND** (a movement must match every active facet); within
a facet the accepted values combine with **OR**. Because a Stub is name-only — no muscle,
equipment, or difficulty — any active facet naturally excludes it, so "show everything"
holds only for the unfiltered view (ADR-0042)."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from enum import Enum
from typing import Protocol

from app.domain.exercise import (
    CatalogCompleteness,
    catalog_completeness,
    provenance_rank,
)
from app.domain.muscle_groups import MuscleGroup, classify

_WHITESPACE = re.compile(r"\s+")


class DifficultyBand(str, Enum):
    """A coarse band over the stored 1–10 difficulty (ADR-0042).

    Three buckets rather than a ten-way picker: **Beginner** (1–3), **Intermediate**
    (4–7), **Advanced** (8–10). The raw 1–10 stays the stored value; the band is the
    read-time bucket the browse facet filters on.
    """

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


# Inclusive difficulty ranges per band. Kept as data so the mapping is auditable and
# the 1–10 scale partitions cleanly with no gaps or overlaps.
_BAND_RANGES: dict[DifficultyBand, tuple[int, int]] = {
    DifficultyBand.BEGINNER: (1, 3),
    DifficultyBand.INTERMEDIATE: (4, 7),
    DifficultyBand.ADVANCED: (8, 10),
}

# Browse order tiebreaker after Provenance trust: more complete content first, so the
# discovery shop-window leads with Enriched movements and Stubs sink to the bottom
# without being hidden (ADR-0042). Any unknown tier sorts alongside a Stub.
_COMPLETENESS_RANK: dict[CatalogCompleteness, int] = {
    CatalogCompleteness.ENRICHED: 0,
    CatalogCompleteness.LISTABLE: 1,
    CatalogCompleteness.STUB: 2,
}

# The real Muscle Groups a browse facet may filter by — the six buckets, never the
# Unclassified leftovers bucket (it is never a coverage target, ADR-0025). Keyed by the
# lowercased label so a facet value arriving as "Legs" or "legs" resolves the same.
_GROUP_BY_LABEL: dict[str, MuscleGroup] = {
    group.value.lower(): group
    for group in MuscleGroup
    if group is not MuscleGroup.UNCLASSIFIED
}


def difficulty_band(difficulty: int) -> DifficultyBand | None:
    """Bucket a stored 1–10 difficulty into its coarse band, or ``None`` when out of range.

    A difficulty outside 1–10 (a bad seed, never expected) maps to no band rather than
    being forced into one, so it simply falls out of any difficulty-filtered view.
    """

    for band, (low, high) in _BAND_RANGES.items():
        if low <= difficulty <= high:
            return band
    return None


def parse_difficulty_band(value: str) -> DifficultyBand | None:
    """Resolve a facet value to a ``DifficultyBand``, case-insensitively, or ``None``.

    An unrecognized value yields ``None`` so the route can drop a junk facet rather than
    error the whole browse — an unknown filter narrows to nothing, never crashes.
    """

    try:
        return DifficultyBand(value.strip().lower())
    except ValueError:
        return None


def parse_muscle_group(value: str) -> MuscleGroup | None:
    """Resolve a facet value to one of the six real Muscle Groups, or ``None``.

    Case-insensitive on the human label ("Legs"/"legs"). ``Unclassified`` and any
    unknown value resolve to ``None`` — Unclassified is never a browse facet (ADR-0025).
    """

    return _GROUP_BY_LABEL.get(value.strip().lower())


def normalize_equipment(equipment: str) -> str:
    """Canonical key for equipment matching: lowercased, trimmed, whitespace collapsed.

    Mirrors ``normalize_name``/muscle normalization so "Pull-up Bar" and "pull-up bar"
    match, keeping the free-form ``required_equipment`` list comparable across the facet.
    """

    return _WHITESPACE.sub(" ", equipment.strip()).lower()


class _Browsable(Protocol):
    """The catalog fields the browse filter and order read on an Exercise.

    A superset of the Completeness projection's inputs (it computes the tier) plus the
    three facet fields and the ordering keys. Typed structurally so both the ORM row and
    any test double satisfy it.
    """

    provenance: str
    normalized_name: str
    description: str | None
    targeted_muscles: list[str]
    instructions: list[str]
    primary_muscles: list[str]
    secondary_muscles: list[str]
    required_equipment: list[str]
    difficulty: int | None
    precautions: list[str]
    image: str | None


def exercise_muscle_groups(targeted_muscles: Sequence[str]) -> set[MuscleGroup]:
    """The distinct curated Muscle Groups an Exercise's targeted muscles roll up into.

    Reuses the one curated mapping (``classify``) so the browse facet and the Analytics
    roll-up can never disagree. May include ``Unclassified`` for unmapped muscles; the
    facet itself only ever asks about real groups, so Unclassified never matches a filter.
    """

    return {classify(muscle) for muscle in targeted_muscles}


def matches_filters(
    exercise: _Browsable,
    *,
    muscle_groups: set[MuscleGroup],
    equipment: set[str],
    difficulty_bands: set[DifficultyBand],
) -> bool:
    """Whether ``exercise`` passes every active browse facet (ADR-0042).

    Facets combine with **AND**; within a facet, membership is **OR**. An empty facet set
    is "no filter" and always passes. ``equipment`` is expected already normalized (via
    ``normalize_equipment``); the exercise side is normalized here so the two compare on
    the same key. A movement missing the content a facet reads — a Stub with no muscles,
    no equipment, or no difficulty — fails that facet, which is exactly why any active
    facet excludes Stubs.
    """

    if muscle_groups:
        groups = exercise_muscle_groups(exercise.targeted_muscles)
        if groups.isdisjoint(muscle_groups):
            return False

    if equipment:
        have = {normalize_equipment(item) for item in exercise.required_equipment}
        if have.isdisjoint(equipment):
            return False

    if difficulty_bands:
        if exercise.difficulty is None:
            return False
        band = difficulty_band(exercise.difficulty)
        if band is None or band not in difficulty_bands:
            return False

    return True


def browse_sort_key(exercise: _Browsable) -> tuple[int, int, str]:
    """The (trust, completeness, name) key the browse list orders on (ADR-0042).

    Curated-first (Provenance rank), then Enriched→Listable→Stub (Catalog Completeness),
    then normalized name A→Z. Completeness is a read-time projection computed here, never
    a stored column.
    """

    return (
        provenance_rank(exercise.provenance),
        _COMPLETENESS_RANK.get(catalog_completeness(exercise), _COMPLETENESS_RANK[CatalogCompleteness.STUB]),
        exercise.normalized_name,
    )


def rank_browse_results(matches: list[_Browsable]) -> list[_Browsable]:
    """Order browse matches curated → completeness → name (ADR-0042).

    Pure and non-mutating: a new sorted list is returned, the input is left as passed.
    ``sorted`` is stable, so matches identical on all three keys keep their input order.
    """

    return sorted(matches, key=browse_sort_key)


def distinct_equipment(exercises: Iterable[_Browsable]) -> list[str]:
    """The Catalog's distinct required-equipment labels, deduped case-insensitively.

    Powers the equipment facet's option list (``GET /api/exercises/facets``): one entry
    per normalized equipment key, keeping the first original casing seen, sorted for a
    stable menu. Blank entries are dropped rather than surfaced as an empty chip.
    """

    seen: dict[str, str] = {}
    for exercise in exercises:
        for raw in exercise.required_equipment:
            key = normalize_equipment(raw)
            if key and key not in seen:
                seen[key] = raw.strip()
    return [seen[key] for key in sorted(seen)]


__all__ = [
    "DifficultyBand",
    "difficulty_band",
    "parse_difficulty_band",
    "parse_muscle_group",
    "normalize_equipment",
    "exercise_muscle_groups",
    "matches_filters",
    "browse_sort_key",
    "rank_browse_results",
    "distinct_equipment",
]
