"""Behavior of the Exercise catalog repository through its public interface,
run over both the in-memory fake and the real SQLModel implementation so the
fake stays honest. The core rule under test is ADR-0002 dedup: same normalized
name reuses the existing Exercise; otherwise a new one is created with the given
Provenance."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryExerciseRepository()
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlExerciseRepository(session)


def test_creates_a_new_exercise_with_provenance_and_fields(repo):
    # Act
    exercise = repo.find_or_create(
        "Barbell Back Squat",
        provenance=Provenance.AI_GENERATED,
        description="A compound lower-body lift.",
        targeted_muscles=["quads", "glutes"],
        required_equipment=["barbell"],
    )

    # Assert
    assert exercise.id is not None
    assert exercise.name == "Barbell Back Squat"
    assert exercise.normalized_name == "barbell back squat"
    assert exercise.provenance == "ai_generated"
    assert exercise.targeted_muscles == ["quads", "glutes"]
    assert exercise.required_equipment == ["barbell"]


def test_equivalent_normalized_name_reuses_the_existing_exercise(repo):
    # Arrange
    first = repo.find_or_create("Push-Up", provenance=Provenance.AI_GENERATED)

    # Act — different casing/spacing is the same normalized name
    again = repo.find_or_create("  push-up ", provenance=Provenance.AI_GENERATED)

    # Assert — reused, not duplicated
    assert again.id == first.id


def test_reuse_does_not_overwrite_the_original_definition(repo):
    # Arrange — a curated entry already exists
    repo.find_or_create(
        "Plank",
        provenance=Provenance.CURATED,
        description="Curated isometric hold.",
    )

    # Act — the AI later "invents" the same movement with a weaker description
    reused = repo.find_or_create(
        "plank",
        provenance=Provenance.AI_GENERATED,
        description="ai guess",
    )

    # Assert — the trusted, curated definition wins; the AI write is a no-op
    assert reused.provenance == "curated"
    assert reused.description == "Curated isometric hold."


def test_distinct_names_create_distinct_exercises(repo):
    # Act
    a = repo.find_or_create("Goblet Squat", provenance=Provenance.AI_GENERATED)
    b = repo.find_or_create("Front Squat", provenance=Provenance.AI_GENERATED)

    # Assert
    assert a.id != b.id


def test_provenance_is_recorded_on_creation(repo):
    # Act
    curated = repo.find_or_create("Deadlift", provenance=Provenance.CURATED)

    # Assert
    assert curated.provenance == "curated"


def test_get_returns_a_previously_created_exercise_by_id(repo):
    # Arrange
    created = repo.find_or_create("Lunge", provenance=Provenance.AI_GENERATED)

    # Act
    fetched = repo.get(created.id)

    # Assert
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.name == "Lunge"


def test_get_returns_none_for_an_unknown_id(repo):
    # Assert
    assert repo.get(9999) is None
