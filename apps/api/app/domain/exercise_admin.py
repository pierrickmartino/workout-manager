"""Admin catalog-browser domain rules (issue #501, ADR-0076).

The pure filter behind the operator-only ops view of the shared Exercise Catalog. Unlike
the user-facing library and Browse surface, this view **hides nothing**: it spans every
Provenance, every Catalog Completeness tier (Stubs included), and both retired and active
rows — so a curator can find and act on any movement. The four filters (name search,
Provenance, Completeness tier, retired/active) are all optional and **compose** (AND'd).

No I/O and provenance/order-blind: the input list is never mutated and a fresh list is
returned, ordered by normalized name for a stable, glanceable, paginable ops list. The
SQL and in-memory repositories both narrow through here, so the two never drift."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol, TypeVar

from app.domain.exercise import (
    CatalogCompleteness,
    Provenance,
    catalog_completeness,
    normalize_name,
)


class _AdminBrowsable(Protocol):
    """The fields the admin browser filter reads on a catalog Exercise.

    The content fields ``catalog_completeness`` projects on, plus the two ops axes the
    view narrows by that the public catalog never exposes — Provenance (stored as its
    string value) and the ``retired`` tombstone — and ``normalized_name`` for the
    case-insensitive name search and the A→Z ordering."""

    normalized_name: str
    provenance: str
    retired: bool
    description: str | None
    targeted_muscles: list[str]
    instructions: list[str]
    primary_muscles: list[str]
    secondary_muscles: list[str]
    difficulty: int | None
    precautions: list[str]
    image: str | None


_BrowsableT = TypeVar("_BrowsableT", bound=_AdminBrowsable)


@dataclass(frozen=True)
class AdminBrowseFilters:
    """The optional, composable filters for the admin catalog browser.

    ``query`` substring-matches the normalized name (blank matches everything);
    ``provenance`` and ``completeness`` pin a single tier on each axis; ``retired`` picks
    active (``False``) or retired (``True``) rows. A ``None`` on any axis leaves it
    unfiltered — so the default (all-``None``, blank query) is the whole Catalog."""

    query: str = ""
    provenance: Provenance | None = None
    completeness: CatalogCompleteness | None = None
    retired: bool | None = None


def filter_admin_catalog(
    exercises: Iterable[_BrowsableT], filters: AdminBrowseFilters
) -> list[_BrowsableT]:
    """Narrow the Catalog by the admin browser's composable filters, ordered by name.

    Applies the name search, Provenance, Completeness-tier, and retired/active filters
    with AND semantics — a ``None`` axis is skipped — then returns a fresh list ordered
    A→Z by normalized name. Pure: the input is neither mutated nor reordered, and the
    Completeness tier is the same read-time projection the rest of the system uses, so
    the ops view can never drift from the per-Exercise tiering."""

    normalized_query = normalize_name(filters.query)
    matches = [
        exercise
        for exercise in exercises
        if _matches(exercise, filters, normalized_query)
    ]
    return sorted(matches, key=lambda exercise: exercise.normalized_name)


def _matches(
    exercise: _AdminBrowsable, filters: AdminBrowseFilters, normalized_query: str
) -> bool:
    if normalized_query and normalized_query not in exercise.normalized_name:
        return False
    if filters.provenance is not None and exercise.provenance != filters.provenance.value:
        return False
    if filters.retired is not None and bool(exercise.retired) != filters.retired:
        return False
    if (
        filters.completeness is not None
        and catalog_completeness(exercise) != filters.completeness
    ):
        return False
    return True


__all__ = ["AdminBrowseFilters", "filter_admin_catalog"]
