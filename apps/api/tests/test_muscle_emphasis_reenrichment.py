"""The one-off muscle-emphasis re-enrichment pass (issue #107, ADR-0016).

A human-triggered pass that fills the Primary/Secondary split on *existing*
``ai_generated`` catalog Exercises by classifying each row's flat
``targeted_muscles`` union through the enrichment path. It exists to make the SPECS
muscle map useful for movements invented before the split shipped.

Its guarantees, exercised here over an in-memory repo and a fake generator so the
pass runs offline and deterministically:

- it populates the split for ``ai_generated`` rows;
- it skips ``curated`` rows entirely, so reviewed content is never overwritten by an
  AI batch (Provenance, ADR-0002/0016);
- it never rewrites ``targeted_muscles``, so the F3 Muscle Group roll-up is
  unaffected;
- it is idempotent-friendly: a row that already carries a split is left alone, so a
  re-run costs no AI calls;
- it asserts no primacy it cannot justify: a row with no muscles at all is skipped.
"""

from __future__ import annotations

from app.domain.exercise import Provenance
from app.generation.muscle_emphasis_generator import MuscleEmphasisRequest
from app.generation.schema import GeneratedMuscleEmphasis
from app.generation.muscle_emphasis_reenrichment import reenrich_muscle_emphasis
from app.repositories.exercise_repository import InMemoryExerciseRepository


class FakeMuscleEmphasisGenerator:
    """Returns a canned split and records the requests it was asked to classify.

    By default it makes the first muscle primary and the rest secondary — enough for
    the pass's behavior to be observable without a real model."""

    def __init__(self, *, splits: dict[str, GeneratedMuscleEmphasis] | None = None):
        self._splits = splits or {}
        self.requests: list[MuscleEmphasisRequest] = []

    def generate(self, request: MuscleEmphasisRequest) -> GeneratedMuscleEmphasis:
        self.requests.append(request)
        if request.exercise_name in self._splits:
            return self._splits[request.exercise_name]
        muscles = list(request.targeted_muscles)
        return GeneratedMuscleEmphasis(
            primary_muscles=muscles[:1],
            secondary_muscles=muscles[1:],
        )


def test_populates_the_split_for_an_ai_generated_row_leaving_the_union():
    # Arrange — an ai_generated movement with only the flat union, no split yet
    exercises = InMemoryExerciseRepository()
    exercise = exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes", "adductors"],
    )
    generator = FakeMuscleEmphasisGenerator()

    # Act
    reenrich_muscle_emphasis(exercises=exercises, generator=generator)

    # Assert — the split is asserted from the existing union, which is untouched
    stored = exercises.get(exercise.id)
    assert stored.primary_muscles == ["quads"]
    assert stored.secondary_muscles == ["glutes", "adductors"]
    assert stored.targeted_muscles == ["quads", "glutes", "adductors"]


def test_skips_curated_rows_entirely_and_never_calls_the_ai_for_them():
    # Arrange — a curated movement carrying only the flat union, no split
    exercises = InMemoryExerciseRepository()
    curated = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quads", "glutes"],
    )
    generator = FakeMuscleEmphasisGenerator()

    # Act
    summary = reenrich_muscle_emphasis(exercises=exercises, generator=generator)

    # Assert — reviewed content is never overwritten by the AI batch (ADR-0016):
    # no split written and the generator was never asked about it.
    stored = exercises.get(curated.id)
    assert stored.primary_muscles == []
    assert stored.secondary_muscles == []
    assert generator.requests == []
    assert summary.enriched == 0


def test_leaves_every_targeted_union_unchanged_across_a_mixed_catalog():
    # Arrange — a mixed catalog: one ai_generated to enrich, one curated to skip
    exercises = InMemoryExerciseRepository()
    ai = exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes", "adductors"],
    )
    curated = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quads", "glutes"],
    )

    # Act
    reenrich_muscle_emphasis(
        exercises=exercises, generator=FakeMuscleEmphasisGenerator()
    )

    # Assert — the F3 roll-up field is untouched on both the enriched and skipped row
    assert exercises.get(ai.id).targeted_muscles == ["quads", "glutes", "adductors"]
    assert exercises.get(curated.id).targeted_muscles == ["quads", "glutes"]


def test_is_idempotent_friendly_leaving_already_split_rows_untouched():
    # Arrange — an ai_generated row that already carries an asserted split
    exercises = InMemoryExerciseRepository()
    already = exercises.find_or_create(
        "Wall Sit",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes"],
        primary_muscles=["quads"],
        secondary_muscles=["glutes"],
    )
    generator = FakeMuscleEmphasisGenerator()

    # Act
    summary = reenrich_muscle_emphasis(exercises=exercises, generator=generator)

    # Assert — a re-run pays no AI cost and asserts nothing new on that row
    assert generator.requests == []
    assert summary.enriched == 0
    assert summary.skipped_already_split == 1
    stored = exercises.get(already.id)
    assert stored.primary_muscles == ["quads"]
    assert stored.secondary_muscles == ["glutes"]


def test_skips_a_row_with_no_muscles_rather_than_asserting_an_empty_split():
    # Arrange — an ai_generated row carrying no muscles at all
    exercises = InMemoryExerciseRepository()
    nameless = exercises.find_or_create(
        "Nameless Move",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=[],
    )
    generator = FakeMuscleEmphasisGenerator()

    # Act
    summary = reenrich_muscle_emphasis(exercises=exercises, generator=generator)

    # Assert — nothing to split, so no primacy is fabricated and no AI call is made
    assert generator.requests == []
    assert summary.enriched == 0
    assert summary.skipped_no_muscles == 1
    stored = exercises.get(nameless.id)
    assert stored.primary_muscles == []
    assert stored.secondary_muscles == []


def test_passes_the_existing_name_and_muscles_to_the_enrichment_path():
    # Arrange — the generator must classify the row's own name and existing muscles
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        description="A deep lateral lunge.",
        targeted_muscles=["quads", "glutes", "adductors"],
    )
    generator = FakeMuscleEmphasisGenerator()

    # Act
    reenrich_muscle_emphasis(exercises=exercises, generator=generator)

    # Assert — the request carries the existing union, so the split classifies the
    # muscles the Exercise already claims rather than inventing new ones.
    assert len(generator.requests) == 1
    request = generator.requests[0]
    assert request.exercise_name == "Cossack Squat"
    assert request.description == "A deep lateral lunge."
    assert request.targeted_muscles == ("quads", "glutes", "adductors")


def test_summary_counts_enriched_rows_across_the_batch():
    # Arrange — two eligible ai_generated rows
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Cossack Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads", "glutes"],
    )
    exercises.find_or_create(
        "Sissy Squat",
        provenance=Provenance.AI_GENERATED,
        targeted_muscles=["quads"],
    )

    # Act
    summary = reenrich_muscle_emphasis(
        exercises=exercises, generator=FakeMuscleEmphasisGenerator()
    )

    # Assert
    assert summary.enriched == 2
