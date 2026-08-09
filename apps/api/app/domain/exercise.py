"""Exercise catalog domain rules.

Exercises live in one global catalog shared across all users (ADR-0002). Identity
is by **normalized name** — lowercase, trimmed, internal whitespace collapsed — so
the same logical movement maps to one entry deterministically, with no AI call per
write. The accepted tradeoff is that near-synonyms may enter as separate Exercises
in v1; that is tolerated on purpose and reconciled later.

Every Exercise carries a **Provenance** flag so unvalidated AI content stays
auditable — important given the domain's caution around injury and rehab cases."""

from __future__ import annotations

import re
from enum import Enum
from typing import Protocol, TypeVar

_WHITESPACE = re.compile(r"\s+")


class Provenance(str, Enum):
    """How a catalog Exercise came to exist and how far it can be trusted (ADR-0033).

    ``CURATED`` is human-reviewed and trusted; ``AI_GENERATED`` was invented by the
    AI and is unvalidated; ``USER_ENTERED`` was typed by a user when logging an
    ad-hoc movement with no AI call — the least-validated tier, born with only a
    name until a later enrichment pass fills it in.
    """

    CURATED = "curated"
    AI_GENERATED = "ai_generated"
    USER_ENTERED = "user_entered"


# Search ordering by trust: curated first, then AI-invented, then user-typed. Kept
# as an explicit map so the ranking is total over the vocabulary; any unknown value
# falls into the AI-generated tier, preserving the pre-ADR-0033 "non-curated → 1".
_PROVENANCE_RANK: dict[str, int] = {
    Provenance.CURATED.value: 0,
    Provenance.AI_GENERATED.value: 1,
    Provenance.USER_ENTERED.value: 2,
}


def normalize_name(name: str) -> str:
    """Canonical key for catalog dedup.

    Lowercases, trims, and collapses every run of internal whitespace to a single
    space. Two names that differ only in casing or spacing yield the same key and
    therefore resolve to the same Exercise.
    """

    return _WHITESPACE.sub(" ", name.strip()).lower()


class _Rankable(Protocol):
    """The two fields the Exercise Library ranks a catalog match on."""

    provenance: str
    normalized_name: str


_RankableT = TypeVar("_RankableT", bound=_Rankable)


def rank_exercise_matches(matches: list[_RankableT]) -> list[_RankableT]:
    """Order Exercise Library search results by trust, then by name.

    The library surfaces the trusted, human-reviewed catalog before AI-invented
    entries and those before user-typed ones (ADR-0002/0021/0033), and within each
    Provenance tier orders by the normalized name so results read A→Z. Pure and
    non-mutating: the input list is left as the caller passed it; a new, sorted list
    is returned. ``sorted`` is stable, so matches identical on both keys keep their
    original relative order.
    """

    return sorted(
        matches,
        key=lambda match: (
            _PROVENANCE_RANK.get(match.provenance, 1),
            match.normalized_name,
        ),
    )


class CatalogCompleteness(str, Enum):
    """Whether a catalog Exercise meets the shared quality bar (ADR-0041).

    A **read-time projection** over which content fields are populated — never a
    stored column — in three tiers: ``STUB`` (name only), ``LISTABLE`` (a
    description, a non-empty flat targeted-muscle list, and at least one Execution
    Step), and ``ENRICHED`` (Listable plus the Primary/Secondary emphasis split,
    difficulty, precautions, and an Exercise Image). Measured **provenance-blind**:
    trust (Provenance) and content-presence (Completeness) are separate axes, so a
    curated seed missing fields still reads sub-bar.
    """

    STUB = "stub"
    LISTABLE = "listable"
    ENRICHED = "enriched"


class _Completable(Protocol):
    """The content fields the Catalog Completeness bar reads on an Exercise.

    Deliberately narrower than the full catalog row: the projection depends only on
    field *presence*, never on Provenance, so it stays a pure, provenance-blind
    read."""

    description: str | None
    targeted_muscles: list[str]
    instructions: list[str]
    primary_muscles: list[str]
    secondary_muscles: list[str]
    difficulty: int | None
    precautions: list[str]
    image: str | None


def _has_text(value: str | None) -> bool:
    """A string field counts as present only when it carries non-blank content — a
    whitespace-only value is an empty column, not real content."""

    return bool(value and value.strip())


class _Splittable(Protocol):
    """The two fields that carry a Primary/Secondary emphasis split."""

    primary_muscles: list[str]
    secondary_muscles: list[str]


def has_emphasis_split(exercise: _Splittable) -> bool:
    """Whether the Exercise asserts a Primary/Secondary emphasis split (ADR-0016).

    Any asserted emphasis — a primary or a secondary — is a populated split, so a
    true isolation movement with only a primary still qualifies. An empty split is
    "no asserted primacy", never "all primary". The single source of truth for "has
    a split": both the Catalog Completeness projection and the muscle-emphasis
    re-enrichment pass read through here, so one notion holds across the codebase."""

    return bool(exercise.primary_muscles) or bool(exercise.secondary_muscles)


def _is_listable(exercise: _Completable) -> bool:
    """The minimum bar: a description, a non-empty flat targeted-muscle list, and at
    least one Execution Step. The emphasis split is deliberately *not* required here —
    that is Enriched-tier only (ADR-0041), so the minimum never pressures fabricated
    primacy (ADR-0016)."""

    return (
        _has_text(exercise.description)
        and bool(exercise.targeted_muscles)
        and bool(exercise.instructions)
    )


def _is_enriched(exercise: _Completable) -> bool:
    """The gold bar: Listable plus the Primary/Secondary split, difficulty,
    precautions, and an Exercise Image. Missing any one gold field leaves the
    movement Listable, never Enriched."""

    return (
        _is_listable(exercise)
        and has_emphasis_split(exercise)
        and exercise.difficulty is not None
        and bool(exercise.precautions)
        and _has_text(exercise.image)
    )


def catalog_completeness(exercise: _Completable) -> CatalogCompleteness:
    """Project a catalog Exercise's populated fields onto its Completeness tier.

    Pure and read-time (ADR-0041): computed from field presence alone, with no
    stored column and no write hook, and **provenance-blind** — the projection never
    reads Provenance, so a ``curated``, ``ai_generated``, or ``user_entered`` movement
    is held to the same yardstick. Tiers are checked strongest-first."""

    if _is_enriched(exercise):
        return CatalogCompleteness.ENRICHED
    if _is_listable(exercise):
        return CatalogCompleteness.LISTABLE
    return CatalogCompleteness.STUB


def parse_instruction_steps(instructions: str | None) -> list[str]:
    """Split authored execution prose into ordered Execution Steps (ADR-0015).

    The single source of truth for the newline-split honesty rule: one step per
    non-empty line, blank lines dropped, each line trimmed — and **no** sentence-
    level chopping. A single paragraph (no line breaks) therefore becomes a
    single-element list, and ``None``/blank prose becomes an empty list. The number
    of steps always equals what the author actually wrote.
    """

    if instructions is None:
        return []
    return [line.strip() for line in instructions.splitlines() if line.strip()]
