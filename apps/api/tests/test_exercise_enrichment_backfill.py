"""The Stub-enrichment backfill pass (issue #308, ADR-0041).

A human-triggered pass that lifts existing **Stub** catalog Exercises up to at least
**Listable** by filling each one's description, targeted muscles, Execution Steps,
and difficulty through the enrichment path. It generalizes the muscle-emphasis
re-enrichment pass (ADR-0016) from "split on ``ai_generated``" to "full bar on any
Stub", using the provenance-blind Catalog Completeness projection to decide
eligibility.

Its guarantees, exercised here over an in-memory repo and a fake generator so the
pass runs offline and deterministically:

- it lifts a Stub to Listable regardless of Provenance;
- it **never changes Provenance** — AI-filled content on a ``user_entered`` row stays
  ``user_entered`` (trust and completeness are separate axes, ADR-0041);
- it **never writes precautions or an Exercise Image** — curator-only, because a
  fabricated safety note or a wrong illustration is dangerous here;
- it is idempotent-friendly: a row already at or above Listable is skipped with no AI
  call, so a re-run costs nothing;
- it fabricates nothing for a row with nothing to work from (a blank name).
"""

from __future__ import annotations

from app.domain.exercise import CatalogCompleteness, Provenance, catalog_completeness
from app.generation.exercise_enrichment_backfill import backfill_stub_exercises
from app.generation.exercise_enrichment_generator import EnrichmentRequest
from app.generation.schema import GeneratedEnrichment
from app.repositories.exercise_repository import InMemoryExerciseRepository

LISTABLE_FILL = GeneratedEnrichment(
    description="A deep lateral lunge shifting weight side to side.",
    targeted_muscles=["quads", "glutes", "adductors"],
    instructions=["Step wide.", "Sink into one leg.", "Return to center."],
    difficulty=3,
)


class FakeEnrichmentGenerator:
    """Returns a canned enrichment and records the requests it was asked to fill.

    By default it returns a fill that lifts a Stub to Listable — enough for the
    pass's behavior to be observable without a real model."""

    def __init__(self, *, fills: dict[str, GeneratedEnrichment] | None = None):
        self._fills = fills or {}
        self.requests: list[EnrichmentRequest] = []

    def generate(self, request: EnrichmentRequest) -> GeneratedEnrichment:
        self.requests.append(request)
        return self._fills.get(request.exercise_name, LISTABLE_FILL)


def test_lifts_a_stub_to_listable():
    # Arrange — a name-only Stub
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create("Cossack Squat", provenance=Provenance.AI_GENERATED)
    assert catalog_completeness(stub) is CatalogCompleteness.STUB
    generator = FakeEnrichmentGenerator()

    # Act
    summary = backfill_stub_exercises(exercises=exercises, generator=generator)

    # Assert — the enrichable fields are filled and the row now reads Listable
    stored = exercises.get(stub.id)
    assert stored.description == "A deep lateral lunge shifting weight side to side."
    assert stored.targeted_muscles == ["quads", "glutes", "adductors"]
    assert stored.instructions == ["Step wide.", "Sink into one leg.", "Return to center."]
    assert stored.difficulty == 3
    assert catalog_completeness(stored) is CatalogCompleteness.LISTABLE
    assert summary.enriched == 1


def test_never_changes_provenance():
    # Arrange — a user_entered Stub (the least-trusted tier)
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create("Jefferson Curl", provenance=Provenance.USER_ENTERED)

    # Act
    backfill_stub_exercises(exercises=exercises, generator=FakeEnrichmentGenerator())

    # Assert — AI-filled content never promotes trust: it stays user_entered
    assert exercises.get(stub.id).provenance == Provenance.USER_ENTERED.value


def test_never_writes_precautions_or_an_image():
    # Arrange
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create("Cossack Squat", provenance=Provenance.AI_GENERATED)

    # Act
    backfill_stub_exercises(exercises=exercises, generator=FakeEnrichmentGenerator())

    # Assert — the two curator-only fields are left empty by the AI pass
    stored = exercises.get(stub.id)
    assert stored.precautions == []
    assert stored.image is None


def test_never_writes_a_primary_secondary_split():
    # Arrange — the split is Enriched-tier only; the pass must not fabricate primacy
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create("Cossack Squat", provenance=Provenance.AI_GENERATED)

    # Act
    backfill_stub_exercises(exercises=exercises, generator=FakeEnrichmentGenerator())

    # Assert
    stored = exercises.get(stub.id)
    assert stored.primary_muscles == []
    assert stored.secondary_muscles == []


def test_is_idempotent_friendly_skipping_a_row_already_at_the_bar():
    # Arrange — a Listable row (nothing to lift)
    exercises = InMemoryExerciseRepository()
    listable = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        description="A barbell squat.",
        targeted_muscles=["quads", "glutes"],
        instructions=["Unrack.", "Descend.", "Drive up."],
    )
    generator = FakeEnrichmentGenerator()

    # Act
    summary = backfill_stub_exercises(exercises=exercises, generator=generator)

    # Assert — no AI call and the row is untouched
    assert generator.requests == []
    assert summary.enriched == 0
    assert summary.skipped_already_complete == 1
    assert exercises.get(listable.id).description == "A barbell squat."


def test_skips_a_row_with_nothing_to_work_from_rather_than_fabricating():
    # Arrange — a Stub whose name is blank, so there is nothing to enrich from
    exercises = InMemoryExerciseRepository()
    blank = exercises.find_or_create("   ", provenance=Provenance.USER_ENTERED)
    generator = FakeEnrichmentGenerator()

    # Act
    summary = backfill_stub_exercises(exercises=exercises, generator=generator)

    # Assert — no AI call, no fabricated content
    assert generator.requests == []
    assert summary.enriched == 0
    assert summary.skipped_nothing_to_work_from == 1
    stored = exercises.get(blank.id)
    assert stored.description is None
    assert stored.targeted_muscles == []


def test_discards_a_fill_too_thin_to_lift_the_row_without_blanking_it():
    # Arrange — a partial Stub (has prose, missing muscles + steps) the model can't
    # honestly fill: it returns empty fields per its contract for a too-vague name.
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create(
        "Vibe Move",
        provenance=Provenance.USER_ENTERED,
        description="Something I did once.",
    )
    generator = FakeEnrichmentGenerator(
        fills={"Vibe Move": GeneratedEnrichment()}  # empty fill
    )

    # Act
    summary = backfill_stub_exercises(exercises=exercises, generator=generator)

    # Assert — the empty fill is discarded: the row keeps its prose (not blanked),
    # stays a Stub, and is counted as unfillable rather than a lift
    assert summary.enriched == 0
    assert summary.skipped_unfillable == 1
    stored = exercises.get(stub.id)
    assert stored.description == "Something I did once."
    assert stored.targeted_muscles == []
    assert catalog_completeness(stored) is CatalogCompleteness.STUB


def test_passes_the_stub_name_to_the_enrichment_path():
    # Arrange
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        description="Partial prose.",
    )
    generator = FakeEnrichmentGenerator()

    # Act
    backfill_stub_exercises(exercises=exercises, generator=generator)

    # Assert — the request carries the row's own name and any existing prose
    assert len(generator.requests) == 1
    request = generator.requests[0]
    assert request.exercise_name == "Cossack Squat"
    assert request.description == "Partial prose."


def test_summary_counts_across_a_mixed_catalog():
    # Arrange — two Stubs to enrich, one Listable to skip, one blank to skip
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Cossack Squat", provenance=Provenance.AI_GENERATED)
    exercises.find_or_create("Sissy Squat", provenance=Provenance.USER_ENTERED)
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        description="A barbell squat.",
        targeted_muscles=["quads"],
        instructions=["Squat."],
    )
    exercises.find_or_create("  ", provenance=Provenance.USER_ENTERED)

    # Act
    summary = backfill_stub_exercises(
        exercises=exercises, generator=FakeEnrichmentGenerator()
    )

    # Assert
    assert summary.enriched == 2
    assert summary.skipped_already_complete == 1
    assert summary.skipped_nothing_to_work_from == 1
