"""Pure filter behind the admin catalog browser (issue #501, ADR-0076).

``filter_admin_catalog`` is the one place the admin ops view narrows the shared Catalog:
by a case-insensitive name search, by Provenance, by the computed Catalog Completeness
tier, and by retired/active state — filters that **compose** (AND'd). Unlike the
user-facing library it hides nothing: it spans every Provenance, every Completeness tier
(Stubs included), and both retired and active rows. Pure and provenance/order-blind: it
never mutates the input and returns a fresh list ordered by normalized name."""

from __future__ import annotations

from types import SimpleNamespace

from app.domain.exercise import CatalogCompleteness, Provenance
from app.domain.exercise_admin import AdminBrowseFilters, filter_admin_catalog


def _exercise(
    name: str,
    *,
    provenance: Provenance = Provenance.AI_GENERATED,
    retired: bool = False,
    description: str | None = None,
    targeted_muscles: list[str] | None = None,
    instructions: list[str] | None = None,
    primary_muscles: list[str] | None = None,
    secondary_muscles: list[str] | None = None,
    difficulty: int | None = None,
    precautions: list[str] | None = None,
    image: str | None = None,
) -> SimpleNamespace:
    """A minimal stand-in carrying only the fields the admin filter reads."""

    return SimpleNamespace(
        name=name,
        normalized_name=" ".join(name.split()).lower(),
        provenance=provenance.value,
        retired=retired,
        description=description,
        targeted_muscles=targeted_muscles or [],
        instructions=instructions or [],
        primary_muscles=primary_muscles or [],
        secondary_muscles=secondary_muscles or [],
        difficulty=difficulty,
        precautions=precautions or [],
        image=image,
    )


def _listable(name: str, **kwargs) -> SimpleNamespace:
    return _exercise(
        name,
        description="A movement.",
        targeted_muscles=["quads"],
        instructions=["Do the thing."],
        **kwargs,
    )


def _names(rows) -> list[str]:
    return [row.name for row in rows]


def test_no_filters_returns_the_whole_catalog_ordered_by_name():
    # Arrange — mixed provenance, tiers, and retired/active, out of order
    catalog = [
        _exercise("Zercher Squat", provenance=Provenance.USER_ENTERED),
        _listable("Air Squat", provenance=Provenance.CURATED),
        _exercise("Muscle Snatch", retired=True),
    ]

    # Act — an empty filter set spans everything (the ops view hides nothing)
    rows = filter_admin_catalog(catalog, AdminBrowseFilters())

    # Assert — every row, retired included, ordered A→Z by normalized name
    assert _names(rows) == ["Air Squat", "Muscle Snatch", "Zercher Squat"]


def test_name_search_is_case_and_whitespace_insensitive_substring():
    catalog = [
        _exercise("Back Squat"),
        _exercise("Front Squat"),
        _exercise("Deadlift"),
    ]

    rows = filter_admin_catalog(catalog, AdminBrowseFilters(query="  SQUAT "))

    assert _names(rows) == ["Back Squat", "Front Squat"]


def test_provenance_filter_keeps_only_that_tier():
    catalog = [
        _exercise("Curated Move", provenance=Provenance.CURATED),
        _exercise("AI Move", provenance=Provenance.AI_GENERATED),
        _exercise("User Move", provenance=Provenance.USER_ENTERED),
    ]

    rows = filter_admin_catalog(
        catalog, AdminBrowseFilters(provenance=Provenance.CURATED)
    )

    assert _names(rows) == ["Curated Move"]


def test_completeness_filter_uses_the_computed_tier():
    catalog = [
        _exercise("Name Only Stub"),  # STUB — name only
        _listable("Listable Move"),  # LISTABLE
    ]

    stubs = filter_admin_catalog(
        catalog, AdminBrowseFilters(completeness=CatalogCompleteness.STUB)
    )
    listable = filter_admin_catalog(
        catalog, AdminBrowseFilters(completeness=CatalogCompleteness.LISTABLE)
    )

    assert _names(stubs) == ["Name Only Stub"]
    assert _names(listable) == ["Listable Move"]


def test_retired_filter_selects_active_or_retired():
    catalog = [
        _exercise("Active Move", retired=False),
        _exercise("Retired Move", retired=True),
    ]

    active = filter_admin_catalog(catalog, AdminBrowseFilters(retired=False))
    retired = filter_admin_catalog(catalog, AdminBrowseFilters(retired=True))

    assert _names(active) == ["Active Move"]
    assert _names(retired) == ["Retired Move"]


def test_filters_compose_with_and_semantics():
    catalog = [
        _listable("Barbell Squat", provenance=Provenance.CURATED, retired=False),
        _listable("Barbell Bench", provenance=Provenance.CURATED, retired=True),
        _listable("Barbell Squat Jump", provenance=Provenance.AI_GENERATED),
        _exercise("Barbell Squat Stub", provenance=Provenance.CURATED),  # STUB
    ]

    rows = filter_admin_catalog(
        catalog,
        AdminBrowseFilters(
            query="squat",
            provenance=Provenance.CURATED,
            completeness=CatalogCompleteness.LISTABLE,
            retired=False,
        ),
    )

    # Only the curated, Listable, active row whose name contains "squat" survives.
    assert _names(rows) == ["Barbell Squat"]


def test_filter_does_not_mutate_or_reorder_the_input():
    catalog = [_exercise("B Move"), _exercise("A Move")]
    original_order = list(catalog)

    filter_admin_catalog(catalog, AdminBrowseFilters())

    assert catalog == original_order
