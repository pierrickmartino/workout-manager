"""Behavior of the Exercise catalog repository through its public interface,
run over both the in-memory fake and the real SQLModel implementation so the
fake stays honest. The core rule under test is ADR-0002 dedup: same normalized
name reuses the existing Exercise; otherwise a new one is created with the given
Provenance."""

from __future__ import annotations

from datetime import date

import pytest
from sqlmodel import Session, SQLModel, select
from tests.conftest import make_fk_engine

from app.db.models import (
    Exercise,
    ExercisePrescription,
    ExerciseRelationship,
    LoggedSession,
    LoggedSet,
    WorkoutSession,
)
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    ExercisePatch,
    InMemoryExerciseRepository,
    NameCollision,
    SqlExerciseRepository,
)


def test_resolve_or_create_reports_a_fresh_create(repo):
    # Act — a genuine normalized-name miss mints a new Stub
    resolved = repo.resolve_or_create(
        "Jefferson Curl", provenance=Provenance.USER_ENTERED
    )

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


def test_set_muscle_emphasis_returns_a_fresh_exercise_without_mutating_the_prior_reference(
    repo,
):
    # Arrange — hold a reference to the pre-change Exercise (no split yet)
    original = repo.find_or_create(
        "Bulgarian Split Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quads", "glutes"],
    )

    # Act — the writer is immutable (coding-style): it returns a fresh Exercise
    updated = repo.set_muscle_emphasis(
        original.id, primary_muscles=["quads"], secondary_muscles=["glutes"]
    )

    # Assert — the returned row carries the split; the earlier reference is untouched
    assert updated is not None
    assert updated.primary_muscles == ["quads"]
    assert original.primary_muscles == []
    assert original.secondary_muscles == []


def test_update_writes_only_the_supplied_descriptive_fields(repo):
    # Arrange — a Listable movement with a full descriptive set
    exercise = repo.find_or_create(
        "Walking Lunge",
        provenance=Provenance.AI_GENERATED,
        description="A split-stance stride.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Step forward."],
        required_equipment=["bodyweight"],
        difficulty=3,
    )

    # Act — a partial edit that corrects only two fields (ADR-0069 spine)
    updated = repo.update(
        exercise.id,
        ExercisePatch(
            description="A long split-stance stride.",
            difficulty=4,
        ),
    )

    # Assert — the two fields change; every untouched field is preserved
    assert updated is not None
    assert updated.description == "A long split-stance stride."
    assert updated.difficulty == 4
    assert updated.targeted_muscles == ["quads", "glutes"]
    assert updated.instructions == ["Step forward."]
    assert updated.required_equipment == ["bodyweight"]
    # …and it persists
    stored = repo.get(exercise.id)
    assert stored.description == "A long split-stance stride."
    assert stored.difficulty == 4


def test_update_writes_the_muscle_emphasis_split(repo):
    # Arrange — a row with only the flat union, no asserted split
    exercise = repo.find_or_create(
        "Bulgarian Split Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes", "hamstrings"],
    )

    # Act — the editor asserts a Primary/Secondary split (ADR-0016)
    updated = repo.update(
        exercise.id,
        ExercisePatch(
            primary_muscles=["quads"],
            secondary_muscles=["glutes", "hamstrings"],
        ),
    )

    # Assert — the split is written; the durable flat union is untouched
    assert updated is not None
    assert updated.primary_muscles == ["quads"]
    assert updated.secondary_muscles == ["glutes", "hamstrings"]
    assert updated.targeted_muscles == ["quads", "glutes", "hamstrings"]


def test_update_renames_and_recomputes_the_normalized_identity(repo):
    # Arrange
    exercise = repo.find_or_create("Barbel Squat", provenance=Provenance.CURATED)

    # Act — a rename to a genuinely different, free name
    updated = repo.update(exercise.id, ExercisePatch(name="Barbell Squat"))

    # Assert — display name and normalized identity both move; a fresh lookup follows
    assert updated is not None
    assert updated.name == "Barbell Squat"
    assert updated.normalized_name == "barbell squat"
    assert repo.get(exercise.id).normalized_name == "barbell squat"


def test_update_allows_a_same_identity_spelling_or_casing_fix(repo):
    # Arrange — the normalized identity is "back squat"
    exercise = repo.find_or_create("back squat", provenance=Provenance.CURATED)

    # Act — a casing fix that does not change the normalized identity is accepted, even
    # though the row itself already "owns" that normalized name (ADR-0002).
    updated = repo.update(exercise.id, ExercisePatch(name="Back Squat"))

    # Assert — the display name is corrected; the identity is unchanged
    assert updated is not None
    assert updated.name == "Back Squat"
    assert updated.normalized_name == "back squat"


def test_update_rejects_a_rename_that_collides_with_another_exercise(repo):
    # Arrange — two distinct movements
    keep = repo.find_or_create("Front Squat", provenance=Provenance.CURATED)
    other = repo.find_or_create("Goblet Squat", provenance=Provenance.CURATED)

    # Act / Assert — renaming one onto the other's normalized name is rejected so two
    # distinct movements are never silently merged
    with pytest.raises(NameCollision):
        repo.update(other.id, ExercisePatch(name="front squat"))

    # …and nothing changed on the colliding row
    unchanged = repo.get(other.id)
    assert unchanged.name == "Goblet Squat"
    assert unchanged.normalized_name == "goblet squat"
    assert repo.get(keep.id).name == "Front Squat"


def test_update_on_an_unknown_id_returns_none(repo):
    # Assert — no row to update, no exception
    assert repo.update(9999, ExercisePatch(description="x")) is None


def test_update_leaves_provenance_and_curator_only_fields_untouched(repo):
    # Arrange — a curated row carrying curator-only / Enriched-tier content
    exercise = repo.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        precautions=["keep a neutral spine"],
        image="https://cdn.example.com/back-squat.svg",
    )

    # Act — a descriptive edit (this ticket) never touches provenance, precautions,
    # the image, or the retired tombstone — those are separate deliberate acts
    repo.update(exercise.id, ExercisePatch(description="A barbell back squat."))

    # Assert
    stored = repo.get(exercise.id)
    assert stored.provenance == Provenance.CURATED.value
    assert stored.precautions == ["keep a neutral spine"]
    assert stored.image == "https://cdn.example.com/back-squat.svg"
    assert stored.retired is False


def test_update_returns_a_fresh_exercise_without_mutating_the_prior_reference(repo):
    # Arrange — hold a reference to the pre-edit Exercise
    original = repo.find_or_create(
        "Push Up",
        provenance=Provenance.CURATED,
        description="old text",
    )

    # Act — the writer is immutable: it returns a fresh Exercise (coding-style, ADR)
    updated = repo.update(original.id, ExercisePatch(description="new text"))

    # Assert — the returned row carries the edit; the caller's earlier reference is
    # never mutated in place
    assert updated is not None
    assert updated.description == "new text"
    assert original.description == "old text"


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


def test_set_enrichment_returns_a_fresh_exercise_without_mutating_the_prior_reference(
    repo,
):
    # Arrange — hold a reference to the pre-enrichment Stub (name only)
    original = repo.find_or_create("Sissy Squat", provenance=Provenance.AI_GENERATED)

    # Act — the writer is immutable (coding-style): it returns a fresh Exercise
    updated = repo.set_enrichment(
        original.id,
        description="A knee-dominant quad movement.",
        targeted_muscles=["quads"],
        instructions=["Lean back", "Bend the knees"],
        difficulty=4,
    )

    # Assert — the returned row carries the enrichment; the earlier reference is untouched
    assert updated is not None
    assert updated.description == "A knee-dominant quad movement."
    assert original.description is None
    assert original.targeted_muscles == []


def test_set_provenance_writes_the_tier_and_leaves_everything_else(repo):
    # Arrange — an AI-invented row carrying descriptive + curator-only content
    exercise = repo.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        description="A deep lateral squat.",
        targeted_muscles=["adductors", "quads"],
        precautions=["ease into the depth"],
        image="https://cdn.example.com/cossack.svg",
    )

    # Act — an admin promotes it to curated (ADR-0075): a deliberate trust change
    updated = repo.set_provenance(exercise.id, Provenance.CURATED)

    # Assert — only provenance moved; every other field is preserved
    assert updated is not None
    assert updated.provenance == Provenance.CURATED.value
    stored = repo.get(exercise.id)
    assert stored.provenance == Provenance.CURATED.value
    assert stored.description == "A deep lateral squat."
    assert stored.targeted_muscles == ["adductors", "quads"]
    assert stored.precautions == ["ease into the depth"]
    assert stored.image == "https://cdn.example.com/cossack.svg"
    assert stored.retired is False


def test_set_provenance_returns_a_fresh_exercise_without_mutating_the_prior_reference(
    repo,
):
    # Arrange — hold a reference to the pre-change Exercise
    original = repo.find_or_create("Zercher Squat", provenance=Provenance.AI_GENERATED)

    # Act — the writer is immutable (coding-style): it returns a fresh Exercise
    updated = repo.set_provenance(original.id, Provenance.CURATED)

    # Assert — the returned row carries the change; the earlier reference is untouched
    assert updated is not None
    assert updated.provenance == Provenance.CURATED.value
    assert original.provenance == Provenance.AI_GENERATED.value


def test_set_provenance_on_an_unknown_id_returns_none(repo):
    assert repo.set_provenance(9999, Provenance.CURATED) is None


def test_set_precautions_writes_the_list_and_leaves_everything_else(repo):
    # Arrange — a curated row with no precautions and other content to preserve
    exercise = repo.find_or_create(
        "Overhead Press",
        provenance=Provenance.CURATED,
        description="A standing barbell press.",
        targeted_muscles=["shoulders"],
    )

    # Act — a curator writes the curator-only precautions (spec §5)
    updated = repo.set_precautions(
        exercise.id, ["stop if you feel shoulder impingement"]
    )

    # Assert — only precautions changed; provenance and descriptive fields are preserved
    assert updated is not None
    assert updated.precautions == ["stop if you feel shoulder impingement"]
    stored = repo.get(exercise.id)
    assert stored.precautions == ["stop if you feel shoulder impingement"]
    assert stored.provenance == Provenance.CURATED.value
    assert stored.description == "A standing barbell press."
    assert stored.targeted_muscles == ["shoulders"]


def test_set_precautions_can_clear_the_list(repo):
    # Arrange — a row that already carries precautions
    exercise = repo.find_or_create(
        "Deadlift",
        provenance=Provenance.CURATED,
        precautions=["brace before lifting"],
    )

    # Act — an empty list clears the field (a curator removing a stale caution)
    updated = repo.set_precautions(exercise.id, [])

    # Assert
    assert updated is not None
    assert updated.precautions == []
    assert repo.get(exercise.id).precautions == []


def test_set_precautions_returns_a_fresh_exercise_without_mutating_the_prior_reference(
    repo,
):
    # Arrange — hold a reference to the pre-change Exercise
    original = repo.find_or_create(
        "Bench Press",
        provenance=Provenance.CURATED,
        precautions=["use a spotter"],
    )

    # Act — immutable writer
    updated = repo.set_precautions(
        original.id, ["use a spotter", "warm up the shoulders"]
    )

    # Assert — the earlier reference is never mutated in place
    assert updated is not None
    assert updated.precautions == ["use a spotter", "warm up the shoulders"]
    assert original.precautions == ["use a spotter"]


def test_set_precautions_on_an_unknown_id_returns_none(repo):
    assert repo.set_precautions(9999, ["x"]) is None


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


# --- Retire / un-retire tombstone (ADR-0076) --------------------------------------------


def test_retire_sets_the_flag_and_leaves_everything_else(repo):
    # Arrange — a curated row carrying descriptive + curator-only content
    exercise = repo.find_or_create(
        "Sissy Squat",
        provenance=Provenance.CURATED,
        description="A knee-dominant quad squat.",
        targeted_muscles=["quads"],
        precautions=["ease into the range"],
        image="https://cdn.example.com/sissy.svg",
    )
    assert exercise.retired is False

    # Act — an admin retires it (ADR-0076): a reversible soft tombstone
    updated = repo.retire(exercise.id)

    # Assert — only the tombstone moved; every other field is preserved and it still resolves
    assert updated is not None
    assert updated.retired is True
    stored = repo.get(exercise.id)
    assert stored is not None
    assert stored.retired is True
    assert stored.provenance == Provenance.CURATED.value
    assert stored.description == "A knee-dominant quad squat."
    assert stored.targeted_muscles == ["quads"]
    assert stored.precautions == ["ease into the range"]
    assert stored.image == "https://cdn.example.com/sissy.svg"


def test_unretire_clears_the_flag_for_a_clean_restore(repo):
    # Arrange — a retired row
    exercise = repo.find_or_create("Good Morning", provenance=Provenance.CURATED)
    repo.retire(exercise.id)
    assert repo.get(exercise.id).retired is True

    # Act — an admin un-retires it (ADR-0076): un-retire fully restores discovery
    updated = repo.unretire(exercise.id)

    # Assert
    assert updated is not None
    assert updated.retired is False
    assert repo.get(exercise.id).retired is False


def test_retire_returns_a_fresh_exercise_without_mutating_the_prior_reference(repo):
    # Arrange — hold a reference to the pre-change Exercise
    original = repo.find_or_create("Nordic Curl", provenance=Provenance.CURATED)

    # Act — the writer is immutable (coding-style): it returns a fresh Exercise
    updated = repo.retire(original.id)

    # Assert — the returned row carries the change; the earlier reference is untouched
    assert updated is not None
    assert updated.retired is True
    assert original.retired is False


def test_retire_and_unretire_on_an_unknown_id_return_none(repo):
    assert repo.retire(9999) is None
    assert repo.unretire(9999) is None


# --- Guarded hard delete (ADR-0076, issue #507) -----------------------------------------


def test_hard_delete_removes_the_row(repo):
    # Arrange — the caller (route) has already checked the guard; the repo just removes it
    exercise = repo.find_or_create("Sumo Deadlift", provenance=Provenance.CURATED)
    assert repo.get(exercise.id) is not None

    # Act
    repo.hard_delete(exercise.id)

    # Assert — the row is gone and no longer resolvable by id
    assert repo.get(exercise.id) is None


def test_hard_delete_of_an_unknown_id_is_a_noop(repo):
    # Deleting a missing row is a harmless no-op (the route's 404 guard runs first).
    repo.hard_delete(9999)
    assert repo.get(9999) is None


def test_reference_count_of_an_unreferenced_exercise_is_zero(repo):
    exercise = repo.find_or_create("Turkish Get-Up", provenance=Provenance.CURATED)
    assert repo.reference_count(exercise.id) == 0


def test_reference_count_of_an_unknown_id_is_zero(repo):
    assert repo.reference_count(9999) == 0


def test_in_memory_reference_count_reflects_registered_references():
    # The in-memory fake stands in for the three real reference tables via an explicit
    # test seam, so the route/service delete logic can be exercised offline.
    repo = InMemoryExerciseRepository()
    exercise = repo.find_or_create("Hack Squat", provenance=Provenance.CURATED)

    assert repo.reference_count(exercise.id) == 0
    repo.register_reference(exercise.id)
    repo.register_reference(exercise.id, count=2)

    assert repo.reference_count(exercise.id) == 3


def test_sql_reference_count_sums_prescriptions_logged_sets_and_relationships():
    # The SQL implementation is the source of truth, verified against a real (SQLite) DB:
    # reference_count sums Exercise Prescriptions + Logged Sets + Exercise Relationships in
    # *both* directions (a link "points at" the Exercise whether it is the from or the to).
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        repo = SqlExerciseRepository(session)
        target = repo.find_or_create("Front Squat", provenance=Provenance.CURATED)
        other = repo.find_or_create("Back Squat", provenance=Provenance.CURATED)

        # An Exercise Prescription references the target through its owning Session.
        workout = WorkoutSession(
            clerk_user_id="user_1", training_type="strength", duration_minutes=45
        )
        session.add(workout)
        session.commit()
        session.refresh(workout)
        session.add(
            ExercisePrescription(
                session_id=workout.id,
                exercise_id=target.id,
                position=0,
                sets=3,
                reps="5",
            )
        )

        # A Logged Set references the target through its owning Logged Session.
        logged = LoggedSession(
            clerk_user_id="user_1",
            training_type="strength",
            performed_on=date(2026, 1, 1),
        )
        session.add(logged)
        session.commit()
        session.refresh(logged)
        session.add(
            LoggedSet(logged_session_id=logged.id, exercise_id=target.id, position=0)
        )

        # Two relationships touch the target: one outgoing (target is the from) and one
        # incoming (target is the to) — both are references that block a hard delete.
        session.add(
            ExerciseRelationship(
                from_exercise_id=target.id,
                to_exercise_id=other.id,
                kind="variation",
            )
        )
        session.add(
            ExerciseRelationship(
                from_exercise_id=other.id,
                to_exercise_id=target.id,
                kind="alternative",
            )
        )
        session.commit()

        # Prescription (1) + Logged Set (1) + Relationships in both directions (2) = 4.
        assert repo.reference_count(target.id) == 4
        # The unrelated row is referenced only by the two relationship rows.
        assert repo.reference_count(other.id) == 2


def test_sql_hard_delete_removes_only_the_target_row():
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        repo = SqlExerciseRepository(session)
        target = repo.find_or_create("Zercher Squat", provenance=Provenance.CURATED)
        keep = repo.find_or_create("Goblet Squat", provenance=Provenance.CURATED)

        repo.hard_delete(target.id)

        assert repo.get(target.id) is None
        assert repo.get(keep.id) is not None


def test_search_excludes_retired_by_default_but_includes_on_request(repo):
    # Arrange — one active and one retired match
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    retired = repo.find_or_create("Front Squat", provenance=Provenance.CURATED)
    repo.retire(retired.id)

    # Act / Assert — discovery hides the retired row (ADR-0076)
    default_page = repo.search("squat", limit=10, offset=0)
    assert {e.name for e in default_page.items} == {"Back Squat"}
    assert default_page.total == 1

    # ...but an admin read can span it
    admin_page = repo.search("squat", limit=10, offset=0, include_retired=True)
    assert {e.name for e in admin_page.items} == {"Back Squat", "Front Squat"}
    assert admin_page.total == 2


def test_browse_excludes_retired_by_default_but_includes_on_request(repo):
    # Arrange
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    retired = repo.find_or_create("Front Squat", provenance=Provenance.CURATED)
    repo.retire(retired.id)

    default_page = repo.browse(
        query="squat",
        muscle_groups=[],
        equipment=[],
        difficulty_bands=[],
        limit=10,
        offset=0,
    )
    assert {e.name for e in default_page.items} == {"Back Squat"}
    assert default_page.total == 1

    admin_page = repo.browse(
        query="squat",
        muscle_groups=[],
        equipment=[],
        difficulty_bands=[],
        limit=10,
        offset=0,
        include_retired=True,
    )
    assert {e.name for e in admin_page.items} == {"Back Squat", "Front Squat"}


def test_browse_all_excludes_retired_by_default(repo):
    # Arrange
    repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    retired = repo.find_or_create("Front Squat", provenance=Provenance.CURATED)
    repo.retire(retired.id)

    # Act — the taxonomy read excludes the retired row (ADR-0076)
    matches = repo.browse_all(
        query="squat", muscle_groups=[], equipment=[], difficulty_bands=[]
    )

    # Assert
    assert {e.name for e in matches} == {"Back Squat"}


def test_list_all_excludes_retired_by_default_but_includes_on_request(repo):
    # Arrange
    active = repo.find_or_create("Wall Sit", provenance=Provenance.AI_GENERATED)
    retired = repo.find_or_create("Back Squat", provenance=Provenance.CURATED)
    repo.retire(retired.id)

    # The enrichment scan excludes retired (no LLM spend on a hidden movement)
    assert {row.id for row in repo.list_all()} == {active.id}

    # An admin readout (catalog-health) spans it
    assert {row.id for row in repo.list_all(include_retired=True)} == {
        active.id,
        retired.id,
    }


def test_list_by_provenance_excludes_retired_by_default_but_includes_on_request(repo):
    # Arrange — two AI rows, one retired
    active = repo.find_or_create("Wall Sit", provenance=Provenance.AI_GENERATED)
    retired = repo.find_or_create("Air Squat", provenance=Provenance.AI_GENERATED)
    repo.retire(retired.id)

    # The re-enrichment pass never touches a retired movement (ADR-0076)
    default_rows = repo.list_by_provenance(Provenance.AI_GENERATED)
    assert {row.id for row in default_rows} == {active.id}

    admin_rows = repo.list_by_provenance(Provenance.AI_GENERATED, include_retired=True)
    assert {row.id for row in admin_rows} == {active.id, retired.id}


# --- write-time equipment normalization (ADR-0077, amended) ------------------------


def test_create_stores_equipment_in_canonical_form_keeping_unmapped_verbatim(repo):
    # Arrange / Act — a fresh AI create carrying the exact proliferation the critique names,
    # plus an unmapped product name
    created = repo.find_or_create(
        "Contraption Press",
        provenance=Provenance.AI_GENERATED,
        required_equipment=["Barbell", "barbells", "Floor", "Atletica R8 Combat"],
    )

    # Assert — mapped strings collapse to their canonical token; the product name survives
    # verbatim (never dropped) so a later alias-map fix can still re-bucket it (ADR-0077)
    assert created.required_equipment == ["barbell", "bodyweight", "Atletica R8 Combat"]


def test_dedup_hit_never_renormalizes_existing_equipment(repo):
    # Arrange — an existing row whose stored equipment predates normalization
    seeded = repo.find_or_create(
        "Legacy Move",
        provenance=Provenance.CURATED,
        required_equipment=["barbell"],
    )

    # Act — a later AI resolve of the same normalized name must reuse, not rewrite (ADR-0002)
    resolved = repo.resolve_or_create(
        "legacy move",
        provenance=Provenance.AI_GENERATED,
        required_equipment=["Dumbbells"],
    )

    # Assert — the existing row and its equipment are untouched by the dedup hit
    assert resolved.created is False
    assert resolved.exercise.id == seeded.id
    assert resolved.exercise.required_equipment == ["barbell"]


def test_update_normalizes_supplied_equipment_but_leaves_it_untouched_when_absent(repo):
    # Arrange — a row with clean stored equipment
    row = repo.find_or_create(
        "Editable Move",
        provenance=Provenance.AI_GENERATED,
        required_equipment=["Atletica R8 Combat"],
    )

    # Act — an admin edit that supplies equipment normalizes it through the same boundary
    edited = repo.update(row.id, ExercisePatch(required_equipment=["Dumbbells", "KB"]))
    assert edited is not None
    assert edited.required_equipment == ["dumbbell", "kettlebell"]

    # Act — an unrelated edit (no equipment key) leaves the stored equipment untouched
    renamed = repo.update(edited.id, ExercisePatch(name="Editable Movement"))
    assert renamed is not None
    assert renamed.required_equipment == ["dumbbell", "kettlebell"]
