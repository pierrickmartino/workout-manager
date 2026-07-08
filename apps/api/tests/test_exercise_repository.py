"""Behavior of the Exercise catalog repository through its public interface,
run over both the in-memory fake and the real SQLModel implementation so the
fake stays honest. The core rule under test is ADR-0002 dedup: same normalized
name reuses the existing Exercise; otherwise a new one is created with the given
Provenance."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

from app.db.models import Exercise
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


def test_stores_instructions_as_an_ordered_step_list(repo):
    # Act — the catalog now carries Execution Steps, not a prose blob (ADR-0015)
    exercise = repo.find_or_create(
        "Wall Sit",
        provenance=Provenance.AI_GENERATED,
        instructions=["Set your back against a wall.", "Slide down to parallel."],
    )

    # Assert — the ordered steps are persisted verbatim
    assert exercise.instructions == [
        "Set your back against a wall.",
        "Slide down to parallel.",
    ]


def test_stores_a_primary_secondary_muscle_split(repo):
    # Act — the catalog now carries a Primary/Secondary emphasis split (ADR-0016)
    # layered on top of the flat targeted-muscle union.
    exercise = repo.find_or_create(
        "Bulgarian Split Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes", "hamstrings"],
        primary_muscles=["quads"],
        secondary_muscles=["glutes", "hamstrings"],
    )

    # Assert — the split persists alongside the durable union
    assert exercise.targeted_muscles == ["quads", "glutes", "hamstrings"]
    assert exercise.primary_muscles == ["quads"]
    assert exercise.secondary_muscles == ["glutes", "hamstrings"]


def test_muscle_split_defaults_to_empty_lists(repo):
    # Act — an Exercise created with only the flat list, no asserted split
    exercise = repo.find_or_create(
        "Plank",
        provenance=Provenance.CURATED,
        targeted_muscles=["core"],
    )

    # Assert — no fabricated primacy: the split stays empty (ADR-0016)
    assert exercise.targeted_muscles == ["core"]
    assert exercise.primary_muscles == []
    assert exercise.secondary_muscles == []


def test_instructions_default_to_an_empty_step_list(repo):
    # Act — an Exercise created without instructions
    exercise = repo.find_or_create("Plank", provenance=Provenance.AI_GENERATED)

    # Assert — an empty list, never None or a lone fabricated step
    assert exercise.instructions == []


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


def test_list_by_provenance_returns_only_matching_rows(repo):
    # Arrange — a mixed catalog of AI-invented and curated movements
    ai_a = repo.find_or_create("Wall Sit", provenance=Provenance.AI_GENERATED)
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    ai_b = repo.find_or_create("Cossack Squat", provenance=Provenance.AI_GENERATED)

    # Act — the re-enrichment pass asks for the ai_generated rows only (issue #107)
    ai_rows = repo.list_by_provenance(Provenance.AI_GENERATED)

    # Assert — every ai_generated row, no curated one
    ids = {row.id for row in ai_rows}
    assert ids == {ai_a.id, ai_b.id}
    assert all(row.provenance == "ai_generated" for row in ai_rows)


def test_set_muscle_emphasis_writes_the_split_and_leaves_the_union(repo):
    # Arrange — an ai_generated row carrying only the flat union, no split yet
    exercise = repo.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes", "adductors"],
    )

    # Act — the pass asserts a Primary/Secondary split (ADR-0016)
    updated = repo.set_muscle_emphasis(
        exercise.id,
        primary_muscles=["quads"],
        secondary_muscles=["glutes", "adductors"],
    )

    # Assert — the split is written; the durable union is untouched
    assert updated is not None
    assert updated.primary_muscles == ["quads"]
    assert updated.secondary_muscles == ["glutes", "adductors"]
    assert updated.targeted_muscles == ["quads", "glutes", "adductors"]
    # …and it persists: a fresh read sees the same split
    refetched = repo.get(exercise.id)
    assert refetched.primary_muscles == ["quads"]
    assert refetched.secondary_muscles == ["glutes", "adductors"]


def test_set_muscle_emphasis_on_an_unknown_id_returns_none(repo):
    # Assert — no row to update, no exception
    assert (
        repo.set_muscle_emphasis(9999, primary_muscles=["quads"], secondary_muscles=[])
        is None
    )


def test_losing_concurrent_insert_returns_the_winning_row():
    # Arrange — two requests race to create the same new Exercise. SQLite's
    # in-memory engine shares one DB across sessions on the thread, so we can
    # drive both sides of the race over the same engine.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as winner_session, Session(engine) as loser_session:
        # The winning request commits "Clean" first.
        winner = SqlExerciseRepository(winner_session).find_or_create(
            "Clean", provenance=Provenance.AI_GENERATED
        )

        loser = SqlExerciseRepository(loser_session)
        # Simulate the race: the loser's lookup ran before the winner committed,
        # so its first lookup misses and it tries to insert a duplicate.
        real_lookup = loser._lookup
        calls = {"count": 0}

        def racing_lookup(key: str):
            calls["count"] += 1
            if calls["count"] == 1:
                return None  # not yet visible at lookup time
            return real_lookup(key)

        loser._lookup = racing_lookup  # type: ignore[method-assign]

        # Act — the loser's commit collides on the unique index; it must roll
        # back and return the winner's row instead of raising.
        resolved = loser.find_or_create("Clean", provenance=Provenance.AI_GENERATED)

        # Assert — idempotent under concurrency: same catalog entry, no duplicate.
        assert resolved.id == winner.id
        assert resolved.normalized_name == "clean"
        rows = loser_session.exec(
            select(Exercise).where(Exercise.normalized_name == "clean")
        ).all()
        assert len(rows) == 1
