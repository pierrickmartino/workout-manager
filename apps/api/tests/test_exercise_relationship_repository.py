"""The catalog relationship repository: typed Variation/Alternative links.

Substitution resolves over these links lookup-first, so the repository's job is to
return, for a prescribed Exercise, the catalog Exercises linked to it tagged with
their relationship ``kind``. The contract is verified over both the in-memory fake
and the real SQLModel implementation."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.repositories.exercise_relationship_repository import (
    DuplicateRelationshipError,
    InMemoryExerciseRelationshipRepository,
    RelationDirection,
    SelfLinkError,
    SqlExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemoryExerciseRelationshipRepository(exercises), exercises
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield (
            SqlExerciseRelationshipRepository(session),
            SqlExerciseRepository(session),
        )


def _catalog(exercises):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    goblet = exercises.find_or_create("Goblet Squat", provenance=Provenance.CURATED)
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    return squat, goblet, box


def test_substitutes_for_returns_linked_exercises_tagged_with_kind(repos):
    # Arrange — a box squat Variation and a goblet squat Alternative of the squat
    relationships, exercises = repos
    squat, goblet, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, goblet.id, RelationKind.ALTERNATIVE)

    # Act
    related = relationships.substitutes_for(squat.id)

    # Assert — both links come back, each carrying its target and kind
    by_id = {r.exercise.id: r.kind for r in related}
    assert by_id == {
        box.id: RelationKind.VARIATION,
        goblet.id: RelationKind.ALTERNATIVE,
    }


def test_substitutes_for_is_empty_when_the_exercise_has_no_links(repos):
    relationships, exercises = repos
    squat, _, _ = _catalog(exercises)

    assert relationships.substitutes_for(squat.id) == []


def test_substitutes_for_excludes_a_retired_candidate(repos):
    # Arrange — the squat links to a box-squat Variation and a goblet-squat Alternative;
    # an admin then retires the box squat (ADR-0076).
    relationships, exercises = repos
    squat, goblet, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, goblet.id, RelationKind.ALTERNATIVE)
    exercises.retire(box.id)

    # Act — Substitution candidates and the Exercise-Detail sublist read through this.
    related = relationships.substitutes_for(squat.id)

    # Assert — the retired candidate is gone; the active one remains, kind intact.
    by_id = {r.exercise.id: r.kind for r in related}
    assert by_id == {goblet.id: RelationKind.ALTERNATIVE}


# --- list_for: both directions ----------------------------------------------------------


def test_list_for_returns_outgoing_and_incoming_links_tagged_with_kind_and_direction(
    repos,
):
    # Arrange — the squat has an outgoing Variation (box) and is itself an Alternative of
    # the goblet squat (an incoming link).
    relationships, exercises = repos
    squat, goblet, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(goblet.id, squat.id, RelationKind.ALTERNATIVE)

    # Act
    listed = relationships.list_for(squat.id)

    # Assert — both directions come back, each carrying target, kind, and direction.
    by_id = {r.exercise.id: (r.kind, r.direction) for r in listed}
    assert by_id == {
        box.id: (RelationKind.VARIATION, RelationDirection.OUTGOING),
        goblet.id: (RelationKind.ALTERNATIVE, RelationDirection.INCOMING),
    }


def test_list_for_is_empty_when_the_exercise_has_no_links(repos):
    relationships, exercises = repos
    squat, _, _ = _catalog(exercises)

    assert relationships.list_for(squat.id) == []


def test_list_for_keeps_a_retired_linked_exercise_for_the_admin_view(repos):
    # Arrange — the squat links to the box squat, which is then retired.
    relationships, exercises = repos
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    exercises.retire(box.id)

    # Act — the admin editor reads both directions and must still see the retired link so a
    # curator can manage it (ADR-0076: retired stays visible to ops).
    listed = relationships.list_for(squat.id)

    # Assert — the retired link is present, unlike in the discovery-facing substitutes_for.
    assert {r.exercise.id for r in listed} == {box.id}


# --- add: guards ------------------------------------------------------------------------


def test_add_rejects_a_self_link(repos):
    relationships, exercises = repos
    squat, _, _ = _catalog(exercises)

    with pytest.raises(SelfLinkError):
        relationships.add(squat.id, squat.id, RelationKind.VARIATION)

    assert relationships.list_for(squat.id) == []


def test_add_rejects_a_duplicate_link(repos):
    relationships, exercises = repos
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)

    with pytest.raises(DuplicateRelationshipError):
        relationships.add(squat.id, box.id, RelationKind.VARIATION)

    # The single existing link is untouched — no second row was written.
    assert len(relationships.list_for(squat.id)) == 1


def test_add_allows_the_same_pair_under_a_different_kind(repos):
    # A duplicate is (from, to, kind); the same pair may be linked as both a Variation and
    # an Alternative without tripping the guard.
    relationships, exercises = repos
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, box.id, RelationKind.ALTERNATIVE)

    kinds = {r.kind for r in relationships.list_for(squat.id)}
    assert kinds == {RelationKind.VARIATION, RelationKind.ALTERNATIVE}


# --- remove -----------------------------------------------------------------------------


def test_remove_deletes_the_matching_link(repos):
    relationships, exercises = repos
    squat, goblet, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, goblet.id, RelationKind.ALTERNATIVE)

    relationships.remove(squat.id, box.id, RelationKind.VARIATION)

    remaining = {(r.exercise.id, r.kind) for r in relationships.list_for(squat.id)}
    assert remaining == {(goblet.id, RelationKind.ALTERNATIVE)}


def test_remove_only_deletes_the_matching_kind_for_a_pair(repos):
    relationships, exercises = repos
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(squat.id, box.id, RelationKind.ALTERNATIVE)

    relationships.remove(squat.id, box.id, RelationKind.VARIATION)

    remaining = {r.kind for r in relationships.list_for(squat.id)}
    assert remaining == {RelationKind.ALTERNATIVE}


def test_remove_is_idempotent_when_the_link_is_absent(repos):
    relationships, exercises = repos
    squat, _, box = _catalog(exercises)

    # No link exists; removing one changes nothing and does not raise.
    relationships.remove(squat.id, box.id, RelationKind.VARIATION)

    assert relationships.list_for(squat.id) == []


def test_remove_does_not_create_a_reciprocal_link(repos):
    # No inverse is ever created by add, so only the exact directed link exists.
    relationships, exercises = repos
    squat, _, box = _catalog(exercises)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)

    # The box squat carries the link only as an incoming one — no auto reciprocal outgoing.
    box_links = relationships.list_for(box.id)
    assert [r.direction for r in box_links] == [RelationDirection.INCOMING]
