"""The shared single-row enrichment step (issue #309, ADR-0041).

``enrich_exercise`` is the one per-row enrichment used by *both* triggers: the
human-triggered backfill (issue #308) walks the catalog and calls it per Stub, and
the async-on-create worker (issue #309) calls it once for a freshly minted Stub.
Keeping the step in one place means the two paths can never drift on what "enrich a
Stub" means — same eligibility, same honest-discard rule, same fields written.

Exercised here over an in-memory repo and a fake generator so it runs offline and
deterministically, mirroring the backfill's guarantees at the single-row seam:
a Stub is lifted to Listable; an already-complete or blank row is skipped with no
AI call; an empty fill is discarded rather than blanking the row; Provenance,
precautions, the image, and the emphasis split are never touched."""

from __future__ import annotations

from app.domain.exercise import CatalogCompleteness, Provenance, catalog_completeness
from app.generation.exercise_enrichment import EnrichOutcome, enrich_exercise
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
    """Returns a canned enrichment and records the requests it was asked to fill."""

    def __init__(self, *, fills: dict[str, GeneratedEnrichment] | None = None):
        self._fills = fills or {}
        self.requests: list[EnrichmentRequest] = []

    def generate(self, request: EnrichmentRequest) -> GeneratedEnrichment:
        self.requests.append(request)
        return self._fills.get(request.exercise_name, LISTABLE_FILL)


def test_lifts_a_stub_to_listable_and_reports_enriched():
    # Arrange — a name-only Stub, the shape a fresh create mints
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create("Cossack Squat", provenance=Provenance.USER_ENTERED)
    generator = FakeEnrichmentGenerator()

    # Act
    outcome = enrich_exercise(stub, exercises=exercises, generator=generator)

    # Assert — the enrichable fields are filled and the row now reads Listable
    assert outcome is EnrichOutcome.ENRICHED
    stored = exercises.get(stub.id)
    assert stored.description == "A deep lateral lunge shifting weight side to side."
    assert stored.targeted_muscles == ["quads", "glutes", "adductors"]
    assert catalog_completeness(stored) is CatalogCompleteness.LISTABLE


def test_skips_an_already_complete_row_with_no_ai_call():
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
    outcome = enrich_exercise(listable, exercises=exercises, generator=generator)

    # Assert — idempotent-friendly: no AI call, the row untouched
    assert outcome is EnrichOutcome.SKIPPED_ALREADY_COMPLETE
    assert generator.requests == []
    assert exercises.get(listable.id).description == "A barbell squat."


def test_skips_a_blank_name_with_no_ai_call():
    # Arrange — a Stub whose name is blank: nothing to enrich from
    exercises = InMemoryExerciseRepository()
    blank = exercises.find_or_create("   ", provenance=Provenance.USER_ENTERED)
    generator = FakeEnrichmentGenerator()

    # Act
    outcome = enrich_exercise(blank, exercises=exercises, generator=generator)

    # Assert — fabricates nothing, no AI call
    assert outcome is EnrichOutcome.SKIPPED_NOTHING_TO_WORK_FROM
    assert generator.requests == []
    assert exercises.get(blank.id).description is None


def test_discards_a_fill_too_thin_to_lift_without_blanking_the_row():
    # Arrange — a partial Stub the model can't honestly fill: it returns empty fields.
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create(
        "Vibe Move",
        provenance=Provenance.USER_ENTERED,
        description="Something I did once.",
    )
    generator = FakeEnrichmentGenerator(fills={"Vibe Move": GeneratedEnrichment()})

    # Act
    outcome = enrich_exercise(stub, exercises=exercises, generator=generator)

    # Assert — the empty fill is discarded: the row keeps its prose and stays a Stub
    assert outcome is EnrichOutcome.SKIPPED_UNFILLABLE
    stored = exercises.get(stub.id)
    assert stored.description == "Something I did once."
    assert catalog_completeness(stored) is CatalogCompleteness.STUB


def test_never_touches_provenance_precautions_image_or_split():
    # Arrange — a user_entered Stub that already carries curator-only content
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.USER_ENTERED,
        primary_muscles=["quads"],
        precautions=["Warm up the hips."],
        image="cossack-squat.png",
    )

    # Act
    enrich_exercise(stub, exercises=exercises, generator=FakeEnrichmentGenerator())

    # Assert — trust and the curator-only / Enriched-tier fields are all preserved
    stored = exercises.get(stub.id)
    assert stored.provenance == Provenance.USER_ENTERED.value
    assert stored.precautions == ["Warm up the hips."]
    assert stored.image == "cossack-squat.png"
    assert stored.primary_muscles == ["quads"]


def test_passes_the_rows_name_and_prose_to_the_generator():
    # Arrange
    exercises = InMemoryExerciseRepository()
    stub = exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        description="Partial prose.",
    )
    generator = FakeEnrichmentGenerator()

    # Act
    enrich_exercise(stub, exercises=exercises, generator=generator)

    # Assert — the request carries the row's own name and any existing prose
    assert len(generator.requests) == 1
    assert generator.requests[0].exercise_name == "Cossack Squat"
    assert generator.requests[0].description == "Partial prose."
