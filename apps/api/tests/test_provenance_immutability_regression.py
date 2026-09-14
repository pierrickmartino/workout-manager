"""Regression: no automated path changes an Exercise's Provenance (issue #503, ADR-0075).

ADR-0002/0041 promised Provenance an *immutable origin*; ADR-0075 relaxes that for exactly
one path — the deliberate admin ``set_provenance`` act behind ``PUT
/api/exercises/{id}/provenance`` — and re-reads the invariant as "**no automated path** mutates
Provenance". This test pins that re-reading directly at the repository seam every automated
path flows through:

- **Generation and Substitution** resolve movements by normalized name through
  ``find_or_create`` / ``resolve_or_create``; a dedup hit must return the existing row with its
  trust **untouched**, even when the caller asks for a different Provenance.
- **Enrichment** (``set_enrichment``) and the **descriptive edit** (``update``) write content
  but never trust.

Only ``set_provenance`` moves Provenance, so a future change that lets any of these paths write
trust breaks this test. (Enrichment's own field-level regression lives in
``test_exercise_enrichment.py``; this file guards the shared dedup + writer seam.)"""

from __future__ import annotations

import pytest

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    ExercisePatch,
    InMemoryExerciseRepository,
)


@pytest.fixture()
def exercises() -> InMemoryExerciseRepository:
    return InMemoryExerciseRepository()


def test_dedup_hit_keeps_existing_provenance_even_when_a_new_one_is_requested(exercises):
    # Arrange — a curated movement already in the catalog
    curated = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)

    # Act — the generation/substitution path re-resolves the same normalized name, this time
    # as an AI-invented movement (the worst case: an automated path asking for a lower tier)
    resolved = exercises.resolve_or_create(
        "back squat", provenance=Provenance.AI_GENERATED
    )

    # Assert — the existing row is reused untouched; the AI request never demotes it
    assert resolved.created is False
    assert resolved.exercise.id == curated.id
    assert resolved.exercise.provenance == Provenance.CURATED.value
    assert exercises.get(curated.id).provenance == Provenance.CURATED.value


def test_dedup_hit_never_promotes_provenance_either(exercises):
    # Arrange — an AI-invented movement
    ai = exercises.find_or_create("Cossack Squat", provenance=Provenance.AI_GENERATED)

    # Act — a later resolve asking for curated must NOT confer trust automatically
    exercises.find_or_create("cossack squat", provenance=Provenance.CURATED)

    # Assert — trust is conferred only by the deliberate admin act, never by a name match
    assert exercises.get(ai.id).provenance == Provenance.AI_GENERATED.value


def test_enrichment_write_leaves_provenance_untouched(exercises):
    # Arrange
    stub = exercises.find_or_create(
        "Zercher Squat", provenance=Provenance.USER_ENTERED
    )

    # Act — the enrichment writer fills content
    exercises.set_enrichment(
        stub.id,
        description="A front-loaded squat.",
        targeted_muscles=["quads"],
        instructions=["Rack the bar in the elbows."],
        difficulty=5,
    )

    # Assert — content changed, trust did not
    assert exercises.get(stub.id).provenance == Provenance.USER_ENTERED.value


def test_descriptive_edit_leaves_provenance_untouched(exercises):
    # Arrange
    ai = exercises.find_or_create("Split Squat", provenance=Provenance.AI_GENERATED)

    # Act — the admin descriptive-edit path (issue #502)
    exercises.update(ai.id, ExercisePatch(description="A rear-foot-elevated split squat."))

    # Assert
    assert exercises.get(ai.id).provenance == Provenance.AI_GENERATED.value


def test_only_set_provenance_moves_provenance(exercises):
    # Arrange
    ai = exercises.find_or_create("Hack Squat", provenance=Provenance.AI_GENERATED)

    # Act — the one sanctioned path (ADR-0075)
    exercises.set_provenance(ai.id, Provenance.CURATED)

    # Assert — this, and only this, changes trust
    assert exercises.get(ai.id).provenance == Provenance.CURATED.value
