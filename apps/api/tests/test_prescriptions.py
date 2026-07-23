"""Catalog resolution of Generated Prescriptions into owned drafts (deepening #1).

``resolve_prescriptions`` is the one shared step behind Session generation, Session
Regeneration, and Protocol Adoption: it resolves each generated prescription's
Exercise through the shared catalog (ADR-0002 dedup) and maps every field — the
typed Load (ADR-0010) and the Superset overlay (ADR-0023) included — onto a
``PrescriptionDraft``. These tests exercise it directly through its interface with
an in-memory catalog, so the mapping the three callers all lean on has one test
surface rather than three copies."""

from __future__ import annotations

from app.generation.prescriptions import resolve_prescriptions
from app.generation.schema import GeneratedExercisePrescription
from app.repositories.exercise_repository import InMemoryExerciseRepository


def _prescription(name: str, **overrides) -> GeneratedExercisePrescription:
    fields = dict(
        exercise_name=name,
        exercise_description=f"{name} description.",
        targeted_muscles=["quads"],
        required_equipment=["barbell"],
        sets=3,
        reps="8-12",
        rest_seconds=90,
        tempo="2-0-2",
        recommended_load="70kg",
    )
    fields.update(overrides)
    return GeneratedExercisePrescription(**fields)


def test_resolves_each_exercise_into_a_catalog_entry_as_ai_generated():
    # Arrange
    exercises = InMemoryExerciseRepository()

    # Act
    drafts = resolve_prescriptions(
        [_prescription("Back Squat")], exercises=exercises
    )

    # Assert — a catalog Exercise now exists, created ai_generated, and is referenced
    assert len(drafts) == 1
    created = exercises.get(drafts[0].exercise_id)
    assert created is not None
    assert created.name == "Back Squat"
    assert created.provenance == "ai_generated"


def test_carries_every_prescription_field_including_the_typed_load():
    # Arrange
    exercises = InMemoryExerciseRepository()

    # Act
    draft = resolve_prescriptions(
        [_prescription("Back Squat")], exercises=exercises
    )[0]

    # Assert — scalars pass through; the free-text load is parsed to a typed Load
    assert (draft.sets, draft.reps, draft.rest_seconds, draft.tempo) == (
        3,
        "8-12",
        90,
        "2-0-2",
    )
    assert draft.recommended_load == {"kind": "absolute", "text": "70kg", "kg": 70.0}


def test_carries_the_superset_overlay_across():
    # Arrange — two members of one generated Superset sharing the group + round rest
    exercises = InMemoryExerciseRepository()
    prescriptions = [
        _prescription("Bench Press", superset_group="A", round_rest_seconds=120),
        _prescription("Barbell Row", superset_group="A", round_rest_seconds=120),
    ]

    # Act
    drafts = resolve_prescriptions(prescriptions, exercises=exercises)

    # Assert — grouping is not dropped on the way to the draft
    assert [d.superset_group for d in drafts] == ["A", "A"]
    assert [d.round_rest_seconds for d in drafts] == [120, 120]


def test_reuses_the_catalog_entry_for_a_repeated_exercise_name():
    # Arrange — the same movement prescribed twice must not create two catalog rows
    exercises = InMemoryExerciseRepository()

    # Act
    drafts = resolve_prescriptions(
        [_prescription("Back Squat"), _prescription("back  squat")],
        exercises=exercises,
    )

    # Assert — normalized-name dedup (ADR-0002) yields one shared Exercise
    assert drafts[0].exercise_id == drafts[1].exercise_id


def test_empty_input_yields_no_drafts():
    # Arrange / Act
    drafts = resolve_prescriptions([], exercises=InMemoryExerciseRepository())

    # Assert
    assert drafts == []
