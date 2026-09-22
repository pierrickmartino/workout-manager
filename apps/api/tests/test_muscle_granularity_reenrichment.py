"""The one-off muscle-granularity re-enrichment pass (issue #545, ADR-0016/0078).

A human-triggered pass that sharpens the coarse, group-level ``targeted_muscles`` union on
*existing* ``ai_generated`` catalog Exercises up to individual-muscle resolution — "back"
refined into "latissimus dorsi", "trapezius", "rhomboids" — so the Muscle Atlas heat reads
real per-muscle coverage instead of a group blob. Canonical-muscle classification is a
read-time projection of the same union (ADR-0078), so the finer union sharpens both tiers at
once with no schema change.

Its guarantees, exercised here over an in-memory repo and a fake generator so the pass runs
offline and deterministically:

- it sharpens coarse unions on ``ai_generated`` rows, touching only the union;
- it skips ``curated`` rows entirely, so reviewed content is never overwritten by an AI batch
  (Provenance, ADR-0002/0016);
- the six-group roll-up is unchanged by construction: a refinement that would fabricate or
  drop a Muscle Group is discarded unwritten, and the written finer terms still roll up to the
  same groups;
- it is idempotent-friendly: a row already at fine granularity costs no AI call;
- it fabricates nothing: a row with no muscles is skipped, and an empty or half-sharpened
  refinement is discarded rather than degrading the row.
"""

from __future__ import annotations

import app.config
import app.db.session
import app.generation.llm
import app.repositories.exercise_repository as exercise_repository_module
import sqlmodel
from app.domain.muscle_groups import MuscleGroup, classify
from app.domain.exercise import Provenance
from app.generation import muscle_granularity_reenrichment
from app.generation.muscle_granularity_generator import MuscleGranularityRequest
from app.generation.muscle_granularity_reenrichment import (
    reenrich_muscle_granularity,
)
from app.generation.schema import GeneratedMuscleGranularity
from app.repositories.exercise_repository import InMemoryExerciseRepository
from tests.fake_llm import FakeStructuredLLM

# A default expansion of the placeable coarse regions into their specific muscles, so the fake
# produces fully-fine unions without a real model. A term that is already specific is kept.
# Each region expands into specific muscles the *group* tier can place (front/rear delts and
# rotator cuff, not the off-map "side delts"), so a well-behaved refinement rolls up cleanly.
_EXPANSION: dict[str, list[str]] = {
    "back": ["latissimus dorsi", "trapezius", "rhomboids"],
    "shoulders": ["front delts", "rear delts", "rotator cuff"],
    "deltoids": ["front delts", "rear delts", "rotator cuff"],
    "core": ["rectus abdominis", "obliques", "transverse abdominis"],
}


class FakeMuscleGranularityGenerator:
    """Refines a coarse union to fine muscles and records the requests it was asked to refine.

    By default it expands each coarse region term into the specific muscles nested under it and
    keeps already-fine terms — enough for the pass's behavior to be observable without a real
    model. ``refinements`` overrides the output per exercise name to exercise the guard paths."""

    def __init__(
        self, *, refinements: dict[str, GeneratedMuscleGranularity] | None = None
    ):
        self._refinements = refinements or {}
        self.requests: list[MuscleGranularityRequest] = []

    def generate(
        self, request: MuscleGranularityRequest
    ) -> GeneratedMuscleGranularity:
        self.requests.append(request)
        if request.exercise_name in self._refinements:
            return self._refinements[request.exercise_name]
        out: list[str] = []
        for muscle in request.targeted_muscles:
            out.extend(_EXPANSION.get(muscle.lower(), [muscle]))
        return GeneratedMuscleGranularity(targeted_muscles=out)


def _make(exercises: InMemoryExerciseRepository, name: str, **kwargs):
    kwargs.setdefault("provenance", Provenance.AI_GENERATED)
    return exercises.find_or_create(name, **kwargs)


def test_sharpens_a_coarse_union_on_an_ai_generated_row_touching_only_the_union():
    # Arrange — an ai_generated pull with a coarse union, a split, and other detail
    exercises = InMemoryExerciseRepository()
    exercise = _make(
        exercises,
        "Pull-Up",
        description="A vertical pull.",
        targeted_muscles=["back", "biceps"],
        primary_muscles=["back"],
        secondary_muscles=["biceps"],
        difficulty=5,
    )

    # Act
    reenrich_muscle_granularity(
        exercises=exercises, generator=FakeMuscleGranularityGenerator()
    )

    # Assert — the union is sharpened; the split, description, and difficulty are untouched
    stored = exercises.get(exercise.id)
    assert stored.targeted_muscles == [
        "latissimus dorsi",
        "trapezius",
        "rhomboids",
        "biceps",
    ]
    assert stored.primary_muscles == ["back"]
    assert stored.secondary_muscles == ["biceps"]
    assert stored.description == "A vertical pull."
    assert stored.difficulty == 5


def test_finer_terms_still_roll_up_to_the_correct_six_groups():
    # Arrange — a coarse "back" + "shoulders" + "core" union across the group tiers
    exercises = InMemoryExerciseRepository()
    exercise = _make(
        exercises,
        "Muscle-Up",
        targeted_muscles=["back", "shoulders", "core"],
    )

    # Act
    reenrich_muscle_granularity(
        exercises=exercises, generator=FakeMuscleGranularityGenerator()
    )

    # Assert — every sharpened term rolls up to one of the same three real groups (roll-up
    # unchanged, issue #545): Back, Shoulders, Core — never Unclassified, never a new group.
    stored = exercises.get(exercise.id)
    rolled = {classify(muscle) for muscle in stored.targeted_muscles}
    assert rolled == {MuscleGroup.BACK, MuscleGroup.SHOULDERS, MuscleGroup.CORE}
    assert MuscleGroup.UNCLASSIFIED not in rolled


def test_skips_curated_rows_entirely_and_never_calls_the_ai_for_them():
    # Arrange — a curated movement carrying a coarse union
    exercises = InMemoryExerciseRepository()
    curated = _make(
        exercises,
        "Back Extension",
        provenance=Provenance.CURATED,
        targeted_muscles=["back"],
    )
    generator = FakeMuscleGranularityGenerator()

    # Act
    summary = reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert — reviewed content is never overwritten by the AI batch (ADR-0016)
    assert exercises.get(curated.id).targeted_muscles == ["back"]
    assert generator.requests == []
    assert summary.enriched == 0


def test_is_idempotent_friendly_leaving_already_fine_rows_untouched():
    # Arrange — an ai_generated row whose union is already at individual-muscle granularity
    exercises = InMemoryExerciseRepository()
    already = _make(
        exercises,
        "Barbell Curl",
        targeted_muscles=["biceps brachii", "brachialis"],
    )
    generator = FakeMuscleGranularityGenerator()

    # Act
    summary = reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert — no coarse region to sharpen, so a re-run pays no AI cost and writes nothing
    assert generator.requests == []
    assert summary.enriched == 0
    assert summary.skipped_already_fine == 1
    assert exercises.get(already.id).targeted_muscles == ["biceps brachii", "brachialis"]


def test_skips_a_row_with_no_muscles_rather_than_fabricating_coverage():
    # Arrange — an ai_generated row carrying no muscles at all
    exercises = InMemoryExerciseRepository()
    nameless = _make(exercises, "Mystery Move", targeted_muscles=[])
    generator = FakeMuscleGranularityGenerator()

    # Act
    summary = reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert — nothing to refine, so no AI call and no fabricated union
    assert generator.requests == []
    assert summary.enriched == 0
    assert summary.skipped_no_muscles == 1
    assert exercises.get(nameless.id).targeted_muscles == []


def test_discards_a_refinement_that_would_change_the_group_roll_up():
    # Arrange — the model fabricates an Arms muscle on a Back-only movement
    exercises = InMemoryExerciseRepository()
    exercise = _make(exercises, "Straight-Arm Pulldown", targeted_muscles=["back"])
    generator = FakeMuscleGranularityGenerator(
        refinements={
            "Straight-Arm Pulldown": GeneratedMuscleGranularity(
                targeted_muscles=["latissimus dorsi", "biceps brachii"]
            )
        }
    )

    # Act
    summary = reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert — the fabricating refinement (adds Arms) is discarded; the coarse union survives
    assert exercises.get(exercise.id).targeted_muscles == ["back"]
    assert summary.enriched == 0
    assert summary.skipped_unrefinable == 1


def test_discards_an_empty_refinement():
    # Arrange — the model returns an empty union
    exercises = InMemoryExerciseRepository()
    exercise = _make(exercises, "Good Morning", targeted_muscles=["back"])
    generator = FakeMuscleGranularityGenerator(
        refinements={"Good Morning": GeneratedMuscleGranularity(targeted_muscles=[])}
    )

    # Act
    summary = reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert — an empty fill would blank the row without sharpening it; discard it
    assert exercises.get(exercise.id).targeted_muscles == ["back"]
    assert summary.skipped_unrefinable == 1


def test_discards_a_half_sharpened_refinement_that_still_names_a_region():
    # Arrange — the model sharpens one region but leaves the coarse "back" behind
    exercises = InMemoryExerciseRepository()
    exercise = _make(exercises, "Deadlift", targeted_muscles=["back"])
    generator = FakeMuscleGranularityGenerator(
        refinements={
            "Deadlift": GeneratedMuscleGranularity(
                targeted_muscles=["latissimus dorsi", "back"]
            )
        }
    )

    # Act
    summary = reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert — the blob is not fully sharpened, so the row is left for a retry
    assert exercises.get(exercise.id).targeted_muscles == ["back"]
    assert summary.skipped_unrefinable == 1


def test_passes_the_existing_name_description_and_coarse_union_to_the_generator():
    # Arrange — the generator must refine the row's own name, description, and coarse union
    exercises = InMemoryExerciseRepository()
    _make(
        exercises,
        "Lat Pulldown",
        description="A cable vertical pull.",
        targeted_muscles=["back", "biceps"],
    )
    generator = FakeMuscleGranularityGenerator()

    # Act
    reenrich_muscle_granularity(exercises=exercises, generator=generator)

    # Assert
    assert len(generator.requests) == 1
    request = generator.requests[0]
    assert request.exercise_name == "Lat Pulldown"
    assert request.description == "A cable vertical pull."
    assert request.targeted_muscles == ("back", "biceps")


def test_summary_counts_across_a_mixed_catalog():
    # Arrange — one coarse ai_generated (sharpen), one already-fine (skip), one curated (skip),
    # one no-muscle (skip)
    exercises = InMemoryExerciseRepository()
    _make(exercises, "Pull-Up", targeted_muscles=["back"])
    _make(exercises, "Barbell Curl", targeted_muscles=["biceps brachii"])
    _make(
        exercises,
        "Back Extension",
        provenance=Provenance.CURATED,
        targeted_muscles=["back"],
    )
    _make(exercises, "Mystery Move", targeted_muscles=[])

    # Act
    summary = reenrich_muscle_granularity(
        exercises=exercises, generator=FakeMuscleGranularityGenerator()
    )

    # Assert — only the coarse ai_generated row is sharpened; the curated row never counts
    assert summary.enriched == 1
    assert summary.skipped_already_fine == 1
    assert summary.skipped_no_muscles == 1


class _FakeSession:
    """A no-op stand-in for a SQLModel ``Session`` context manager, so ``main`` can be exercised
    without a real database."""

    def __init__(self, _engine: object) -> None:
        pass

    def __enter__(self) -> _FakeSession:
        return self

    def __exit__(self, *_exc: object) -> None:
        return None


def test_main_wires_the_real_generator_over_the_catalog(monkeypatch):
    # Arrange — stub every cost-bearing dependency ``main`` constructs (settings, engine, DB
    # session, SQL repository) and hand ``build_llm_client`` a fake transport, so the entrypoint
    # runs the *real* LlmMuscleGranularityGenerator and pass offline over a seeded catalog.
    exercises = InMemoryExerciseRepository()
    _make(exercises, "Pull-Up", targeted_muscles=["back"])
    fake_llm = FakeStructuredLLM(
        text='{"targeted_muscles": ["latissimus dorsi", "trapezius", "rhomboids"]}'
    )

    monkeypatch.setattr(app.config, "get_settings", lambda: object())
    monkeypatch.setattr(app.db.session, "get_engine", lambda: object())
    monkeypatch.setattr(app.generation.llm, "build_llm_client", lambda _settings: fake_llm)
    monkeypatch.setattr(sqlmodel, "Session", _FakeSession)
    monkeypatch.setattr(
        exercise_repository_module, "SqlExerciseRepository", lambda _session: exercises
    )

    # Act — the deliberate go/no-go entrypoint (ADR-0016 HITL)
    summary = muscle_granularity_reenrichment.main()

    # Assert — the real generator refined the coarse "back" union through the fake transport
    assert summary.enriched == 1
    assert fake_llm.calls, "the human entrypoint must drive the real LLM-backed generator"
    stored = next(iter(exercises._by_id.values()))
    assert stored.targeted_muscles == ["latissimus dorsi", "trapezius", "rhomboids"]
