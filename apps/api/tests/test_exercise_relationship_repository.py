"""The catalog relationship repository: typed Variation/Alternative links.

Substitution resolves over these links lookup-first, so the repository's job is to
return, for a prescribed Exercise, the catalog Exercises linked to it tagged with
their relationship ``kind``. The contract is verified over both the in-memory fake
and the real SQLModel implementation."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
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
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
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
