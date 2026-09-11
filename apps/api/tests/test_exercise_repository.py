"""Behavior of the Exercise catalog repository through its public interface,
run over both the in-memory fake and the real SQLModel implementation so the
fake stays honest. The core rule under test is ADR-0002 dedup: same normalized
name reuses the existing Exercise; otherwise a new one is created with the given
Provenance."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, select
from tests.conftest import make_fk_engine

from app.db.models import Exercise
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)


def test_resolve_or_create_reports_a_fresh_create(repo):
    # Act — a genuine normalized-name miss mints a new Stub
    resolved = repo.resolve_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)

    # Assert — the created flag is the async-enrichment trigger (issue #309): a real
    # create is reported so the endpoint knows to enqueue an Enrichment job for it.
    assert resolved.created is True
    assert resolved.exercise.id is not None
    assert resolved.exercise.name == "Jefferson Curl"
    assert resolved.exercise.provenance == Provenance.USER_ENTERED.value


def test_resolve_or_create_reports_a_dedup_hit(repo):
    # Arrange — the movement already exists (a prior curated seed)
    seeded = repo.find_or_create("Running", provenance=Provenance.CURATED)

    # Act — a normalized-name hit resolves to the existing row
    resolved = repo.resolve_or_create("  running ", provenance=Provenance.USER_ENTERED)

    # Assert — created is False (a dedup hit must enqueue nothing, ADR-0002) and the
    # existing entry's Provenance is untouched by the resolve
    assert resolved.created is False
    assert resolved.exercise.id == seeded.id
    assert resolved.exercise.provenance == Provenance.CURATED.value


def test_resolve_or_create_and_find_or_create_agree_on_the_row(repo):
    # Arrange — find_or_create still returns the same row resolve_or_create would
    first = repo.resolve_or_create("Box Jump", provenance=Provenance.USER_ENTERED)

    # Act — a second resolve is a dedup hit onto the same catalog entry
    second = repo.find_or_create("box jump", provenance=Provenance.USER_ENTERED)

    # Assert — one catalog entry, reused
    assert second.id == first.exercise.id


def test_losing_concurrent_resolve_reports_no_create():
    # Arrange — two requests race to create the same new Exercise; the loser must
    # report created=False so it never enqueues a duplicate Enrichment job for a row
    # the winner already created (and already enqueued).
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as winner_session, Session(engine) as loser_session:
        winner = SqlExerciseRepository(winner_session).find_or_create(
            "Clean", provenance=Provenance.AI_GENERATED
        )

        loser = SqlExerciseRepository(loser_session)
        real_lookup = loser._lookup
        calls = {"count": 0}

        def racing_lookup(key: str):
            calls["count"] += 1
            if calls["count"] == 1:
                return None  # not yet visible at lookup time
            return real_lookup(key)

        loser._lookup = racing_lookup  # type: ignore[method-assign]

        # Act — the loser collides on the unique index, rolls back, and resolves to
        # the winner's row.
        resolved = loser.resolve_or_create("Clean", provenance=Provenance.AI_GENERATED)

        # Assert — same row, and reported as a dedup hit (no create), not a mint.
        assert resolved.created is False
        assert resolved.exercise.id == winner.id


@pytest.fixture(params=["in_memory", "sql"])
def repo(request):
    if request.param == "in_memory":
        yield InMemoryExerciseRepository()
        return
    engine = make_fk_engine()
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


def test_list_all_returns_every_row_regardless_of_provenance(repo):
    # Arrange — a catalog spanning all three Provenance tiers
    ai = repo.find_or_create("Wall Sit", provenance=Provenance.AI_GENERATED)
    curated = repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    user = repo.find_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)

    # Act — the Stub-enrichment backfill walks the whole catalog (issue #308)
    rows = repo.list_all()

    # Assert — every row, no tier filtered out
    assert {row.id for row in rows} == {ai.id, curated.id, user.id}


def test_set_enrichment_writes_the_enrichable_fields(repo):
    # Arrange — a name-only Stub
    exercise = repo.find_or_create("Cossack Squat", provenance=Provenance.USER_ENTERED)

    # Act — the backfill fills the fields that lift a Stub to Listable (ADR-0041)
    updated = repo.set_enrichment(
        exercise.id,
        description="A deep lateral lunge.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Step wide.", "Sink low."],
        difficulty=3,
    )

    # Assert — the enrichable set is written and persists
    assert updated is not None
    assert updated.description == "A deep lateral lunge."
    assert updated.targeted_muscles == ["quads", "glutes"]
    assert updated.instructions == ["Step wide.", "Sink low."]
    assert updated.difficulty == 3
    refetched = repo.get(exercise.id)
    assert refetched.description == "A deep lateral lunge."
    assert refetched.difficulty == 3


def test_set_enrichment_preserves_pre_existing_provenance_precautions_image_split(repo):
    # Arrange — a row that already carries curator-only and Enriched-tier content, so
    # the test proves set_enrichment *preserves* those values, not merely that a fresh
    # row's defaults stay empty.
    exercise = repo.find_or_create(
        "Cossack Squat",
        provenance=Provenance.USER_ENTERED,
        primary_muscles=["quads"],
        secondary_muscles=["glutes"],
        precautions=["Warm up the hips."],
        image="cossack-squat.png",
    )

    # Act
    repo.set_enrichment(
        exercise.id,
        description="A deep lateral lunge.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Step wide."],
        difficulty=3,
    )

    # Assert — enrichment touches only the enrichable set: trust and the pre-existing
    # curator-only / Enriched-tier fields are all left exactly as they were
    stored = repo.get(exercise.id)
    assert stored.provenance == Provenance.USER_ENTERED.value
    assert stored.precautions == ["Warm up the hips."]
    assert stored.image == "cossack-squat.png"
    assert stored.primary_muscles == ["quads"]
    assert stored.secondary_muscles == ["glutes"]


def test_set_enrichment_on_an_unknown_id_returns_none(repo):
    # Assert — no row to update, no exception
    assert (
        repo.set_enrichment(
            9999,
            description="x",
            targeted_muscles=[],
            instructions=[],
            difficulty=None,
        )
        is None
    )


def test_losing_concurrent_insert_returns_the_winning_row():
    # Arrange — two requests race to create the same new Exercise. SQLite's
    # in-memory engine shares one DB across sessions on the thread, so we can
    # drive both sides of the race over the same engine.
    engine = make_fk_engine()
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


def test_search_matches_a_normalized_name_substring(repo):
    # Arrange — a small catalog
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    repo.find_or_create("Front Squat", provenance=Provenance.CURATED)
    repo.find_or_create("Deadlift", provenance=Provenance.CURATED)

    # Act — substring match, case-insensitive via normalization
    page = repo.search("SQUAT", limit=10, offset=0)

    # Assert — both squats, not the deadlift
    assert {e.name for e in page.items} == {"Back Squat", "Front Squat"}
    assert page.total == 2


def test_search_orders_curated_first_then_by_name(repo):
    # Arrange — a mix of provenance across matching names
    repo.find_or_create("Zercher Squat", provenance=Provenance.CURATED)
    repo.find_or_create("Air Squat", provenance=Provenance.AI_GENERATED)
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)

    # Act
    page = repo.search("squat", limit=10, offset=0)

    # Assert — curated A→Z, then the AI-invented one last (ADR-0002/0021)
    assert [e.name for e in page.items] == [
        "Back Squat",
        "Zercher Squat",
        "Air Squat",
    ]


def test_search_paginates_with_limit_and_offset(repo):
    # Arrange — three curated matches, ranked Back < Front < Goblet
    repo.find_or_create("Goblet Squat", provenance=Provenance.CURATED)
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    repo.find_or_create("Front Squat", provenance=Provenance.CURATED)

    # Act — the second page of size one
    page = repo.search("squat", limit=1, offset=1)

    # Assert — the middle of the ranked order, with the full match count
    assert [e.name for e in page.items] == ["Front Squat"]
    assert page.total == 3


def test_search_returns_no_matches_and_creates_nothing(repo):
    # Arrange
    repo.find_or_create("Deadlift", provenance=Provenance.CURATED)

    # Act — a movement absent from the catalog
    page = repo.search("clean and jerk", limit=10, offset=0)

    # Assert — empty result, and the catalog was not grown (pick-only, ADR-0021)
    assert page.items == []
    assert page.total == 0
    assert repo.search("", limit=10, offset=0).total == 0
