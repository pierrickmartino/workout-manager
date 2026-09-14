"""Regression: generation / substitution reuse a Retired row without un-retiring it (#506).

ADR-0076's dedup edge case: ``normalized_name`` is uniquely indexed and ``find_or_create`` /
``resolve_or_create`` look up purely by that name with **no status predicate**, so when an
automated path (generation or substitution) emits a movement whose name normalizes to a
retired row, it must **reuse the existing row by id without un-retiring it**. The user's plan
resolves the movement fine (references are by id), but it stays absent from discovery, and
un-retire remains an admin-only act — the AI re-inventing a junk name can never resurrect a
curator's retired movement.

This test pins that at the repository seam every automated path flows through. A future change
that let a dedup hit clear ``retired`` — or minted a second row for the name — breaks it."""

from __future__ import annotations

import pytest

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import InMemoryExerciseRepository


@pytest.fixture()
def exercises() -> InMemoryExerciseRepository:
    return InMemoryExerciseRepository()


def test_dedup_hit_reuses_a_retired_row_without_un_retiring_it(exercises):
    # Arrange — a curator retires a junk movement
    retired = exercises.find_or_create("Broga Flow", provenance=Provenance.AI_GENERATED)
    exercises.retire(retired.id)

    # Act — an automated path re-emits the same normalized name (the AI re-inventing it)
    resolved = exercises.resolve_or_create(
        "  broga flow ", provenance=Provenance.AI_GENERATED
    )

    # Assert — the existing row is reused untouched: same id, no second row, still retired
    assert resolved.created is False
    assert resolved.exercise.id == retired.id
    assert resolved.exercise.retired is True
    assert exercises.get(retired.id).retired is True


def test_find_or_create_binds_to_the_retired_row_and_leaves_it_hidden(exercises):
    # Arrange — a retired movement
    retired = exercises.find_or_create("Shake Weight Curl", provenance=Provenance.CURATED)
    exercises.retire(retired.id)

    # Act — the substitution/generation convenience wrapper resolves the same name
    bound = exercises.find_or_create(
        "Shake Weight Curl", provenance=Provenance.AI_GENERATED
    )

    # Assert — bound by id (a live plan resolves the movement), but still retired: an
    # automated path is never a resurrection, so discovery still hides it.
    assert bound.id == retired.id
    assert bound.retired is True
    assert exercises.search("shake weight", limit=10, offset=0).items == []
