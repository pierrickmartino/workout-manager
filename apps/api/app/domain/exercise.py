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
