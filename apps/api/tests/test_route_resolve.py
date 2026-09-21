"""The shared resolve-or-404 seam for catalog Exercise routes.

``get_exercise_or_404`` is the one place the exercise-catalog routes turn a missing id into a
404, replacing the ``get(); if None: raise`` preamble copied across ~11 handlers in
``routes/exercises.py`` and ``routes/exercise_images.py``. These pin both arms — the Exercise is
returned when present, and a missing id raises ``HTTPException(404)`` with the shared detail — so
the 404 signalling has its own test surface and every caller inherits it."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.routes.resolve import get_exercise_or_404


def test_returns_the_exercise_when_it_exists():
    exercises = InMemoryExerciseRepository()
    created = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)

    resolved = get_exercise_or_404(exercises, created.id)

    assert resolved.id == created.id


def test_raises_404_when_the_exercise_is_missing():
    exercises = InMemoryExerciseRepository()

    with pytest.raises(HTTPException) as exc_info:
        get_exercise_or_404(exercises, 999)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Exercise not found"
