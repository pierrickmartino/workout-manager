"""Per-exercise progress over time (Slice 12) — a read-only view of the *record*.

``exercise_progress`` reads the user's Logged Sessions and projects them onto a
single Exercise: one ``ExerciseProgressPoint`` per performance date, carrying the
Logged Sets done that day (reps, load, perceived difficulty). It answers "am I
improving on this movement?" purely from what was logged — no plan is read or
mutated, and no AI runs. Points are ordered oldest-first so a chart reads
left-to-right in time. Reads are scoped to the owning user because the underlying
repository's ``list_for_user`` already is. Pure orchestration over the
Logged-Session repository; no HTTP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSetView,
)


@dataclass(frozen=True)
class ExerciseProgressPoint:
    """One performance of an Exercise: the date and the sets done that day."""

    logged_session_id: int
    performed_on: date
    sets: list[LoggedSetView]


@dataclass(frozen=True)
class ExerciseProgressView:
    """An Exercise's logged history as an oldest-first time series of points."""

    exercise_id: int
    exercise_name: str
    points: list[ExerciseProgressPoint]


def exercise_progress(
    clerk_user_id: str,
    exercise_id: int,
    *,
    logged: LoggedSessionRepository,
) -> ExerciseProgressView:
    """Return the user's logged history for one Exercise, oldest performance first.

    Only Logged Sessions in which the Exercise was actually performed contribute a
    point; the sets within a point are the ones for that Exercise. The view is
    empty (with an empty ``exercise_name``) when the user has never logged it.
    """

    history = logged.list_for_user(clerk_user_id)

    points: list[ExerciseProgressPoint] = []
    exercise_name = ""
    for session in history:
        matching = [s for s in session.logged_sets if s.exercise_id == exercise_id]
        if not matching:
            continue
        if not exercise_name:
            exercise_name = matching[0].exercise_name
        points.append(
            ExerciseProgressPoint(
                logged_session_id=session.id,
                performed_on=session.performed_on,
                sets=matching,
            )
        )

    # ``list_for_user`` returns newest-first; a progress series reads in time order.
    points.reverse()
    return ExerciseProgressView(
        exercise_id=exercise_id,
        exercise_name=exercise_name,
        points=points,
    )


__all__ = [
    "ExerciseProgressPoint",
    "ExerciseProgressView",
    "exercise_progress",
]
