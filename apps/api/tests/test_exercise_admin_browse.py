"""The admin catalog-browser repository read (issue #501, ADR-0076).

``admin_browse`` is the operator-only feed behind the admin ops view: it spans the whole
shared Catalog — every Provenance, every Completeness tier (Stubs included), and both
retired and active rows — narrowed by the composable filters and paged with the full
filtered count in ``total``. Run over both the in-memory fake and the real SQLModel
implementation so the fake stays honest against the same contract."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.domain.exercise import CatalogCompleteness, Provenance
from app.domain.exercise_admin import AdminBrowseFilters
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryExerciseRepository()
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlExerciseRepository(session)


def _seed(repo) -> None:
    """A Stub, a Listable, an Enriched, and one of every Provenance."""

    repo.find_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)  # STUB
    repo.find_or_create(
        "Walking Lunge",
        provenance=Provenance.AI_GENERATED,
        description="A split-stance stride.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Step forward and lower."],
    )  # LISTABLE
    repo.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        description="A barbell squat.",
        targeted_muscles=["quads", "glutes"],
        primary_muscles=["quads"],
        secondary_muscles=["glutes"],
        instructions=["Brace your core."],
        difficulty=6,
        precautions=["keep a neutral spine"],
        image="https://cdn.example.com/curated/back-squat.svg",
    )  # ENRICHED


def _names(page) -> list[str]:
    return [exercise.name for exercise in page.items]


def test_admin_browse_spans_every_provenance_and_tier_including_stubs(repo):
    # Arrange — one movement per tier boundary, spanning every Provenance
    _seed(repo)

    # Act — no filters: the ops view hides nothing
    page = repo.admin_browse(filters=AdminBrowseFilters(), limit=50, offset=0)

    # Assert — every row (Stub included), ordered A→Z by name, with an accurate total
    assert _names(page) == ["Back Squat", "Jefferson Curl", "Walking Lunge"]
    assert page.total == 3


def test_admin_browse_filters_by_name(repo):
    _seed(repo)

    page = repo.admin_browse(
        filters=AdminBrowseFilters(query="squat"), limit=50, offset=0
    )

    assert _names(page) == ["Back Squat"]
    assert page.total == 1


def test_admin_browse_filters_by_provenance(repo):
    _seed(repo)

    page = repo.admin_browse(
        filters=AdminBrowseFilters(provenance=Provenance.USER_ENTERED),
        limit=50,
        offset=0,
    )

    assert _names(page) == ["Jefferson Curl"]
    assert page.total == 1


def test_admin_browse_filters_by_completeness_tier(repo):
    _seed(repo)

    page = repo.admin_browse(
        filters=AdminBrowseFilters(completeness=CatalogCompleteness.ENRICHED),
        limit=50,
        offset=0,
    )

    assert _names(page) == ["Back Squat"]
    assert page.total == 1


def test_admin_browse_includes_and_filters_retired_rows(repo):
    # Arrange — retire one movement (the retire endpoint lands later; here we set the
    # tombstone directly to exercise the read). autoflush makes it visible to the query.
    _seed(repo)
    retired = repo.find_or_create("Sissy Squat", provenance=Provenance.CURATED)
    retired.retired = True

    # Act — the default view includes retired rows; the retired filter isolates them
    all_rows = repo.admin_browse(filters=AdminBrowseFilters(), limit=50, offset=0)
    only_retired = repo.admin_browse(
        filters=AdminBrowseFilters(retired=True), limit=50, offset=0
    )
    only_active = repo.admin_browse(
        filters=AdminBrowseFilters(retired=False), limit=50, offset=0
    )

    # Assert — retired rows surface in the ops view (unlike discovery), and compose
    assert "Sissy Squat" in _names(all_rows)
    assert _names(only_retired) == ["Sissy Squat"]
    assert "Sissy Squat" not in _names(only_active)


def test_admin_browse_paginates_with_full_total(repo):
    _seed(repo)

    page = repo.admin_browse(filters=AdminBrowseFilters(), limit=1, offset=1)

    # The middle row of the A→Z order, with the full filtered count as total.
    assert _names(page) == ["Jefferson Curl"]
    assert page.total == 3
