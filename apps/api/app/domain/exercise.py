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

_WHITESPACE = re.compile(r"\s+")


class Provenance(str, Enum):
    """Whether a catalog Exercise was invented by the AI or reviewed by a human."""

    AI_GENERATED = "ai_generated"
    CURATED = "curated"


def normalize_name(name: str) -> str:
    """Canonical key for catalog dedup.

    Lowercases, trims, and collapses every run of internal whitespace to a single
    space. Two names that differ only in casing or spacing yield the same key and
    therefore resolve to the same Exercise.
    """

    return _WHITESPACE.sub(" ", name.strip()).lower()
