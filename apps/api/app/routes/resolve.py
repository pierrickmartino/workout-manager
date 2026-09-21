"""The resolve-or-404 seam for catalog Exercise routes.

Every exercise-id route resolves the global catalog Exercise the same way — fetch by id, and a
missing id is a 404. That ``get(); if None: raise HTTPException`` preamble was copied across ~11
handlers in ``routes/exercises.py`` and ``routes/exercise_images.py``; this concentrates it, so
the 404 status and detail (and any future logging) live in one place and every handler shrinks
to its actual behaviour.

A web-layer concern — it raises ``HTTPException`` — so it lives in ``routes`` and never in the
repository (which must not import FastAPI). Owner-scoped resources (Sessions, Protocols) fold
ownership into their own "not found" and resolve through their own seam, not this one.
"""

from __future__ import annotations

from fastapi import HTTPException

from app.db.models import Exercise
from app.repositories.exercise_repository import ExerciseRepository

HTTP_NOT_FOUND = 404


def get_exercise_or_404(exercises: ExerciseRepository, exercise_id: int) -> Exercise:
    """Return the catalog Exercise, or raise ``HTTPException(404)`` when the id resolves to none.

    The one resolve-or-404 both exercise-catalog route files share. Returns the non-optional
    Exercise so the caller drops the ``is None`` branch entirely."""

    exercise = exercises.get(exercise_id)
    if exercise is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Exercise not found")
    return exercise


__all__ = ["get_exercise_or_404"]
