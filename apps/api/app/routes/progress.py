"""Progress routes: read a user's performance of one Exercise over time.

``GET /api/exercises/{exercise_id}/progress`` returns the user's logged history for
a single Exercise as an oldest-first time series — one point per performance date,
each carrying the Logged Sets done that day (reps, load, perceived difficulty). It
is read-only over the *record* side: no plan is read or mutated, no AI runs. An
Exercise the user has never performed yields an empty series. Responses use the
standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.logbook.progress import ExerciseProgressView, exercise_progress
from app.repositories.deps import get_logged_session_repository
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["progress"])


def _serialize(view: ExerciseProgressView) -> dict:
    return {
        "exercise_id": view.exercise_id,
        "exercise_name": view.exercise_name,
        "points": [
            {
                "logged_session_id": point.logged_session_id,
                "performed_on": point.performed_on.isoformat(),
                "sets": [
                    {
                        "position": s.position,
                        "reps": s.reps,
                        "load": s.load,
                        "perceived_difficulty": s.perceived_difficulty,
                    }
                    for s in point.sets
                ],
            }
            for point in view.points
        ],
    }


@router.get("/exercises/{exercise_id}/progress")
def read_exercise_progress(
    exercise_id: int,
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    view = exercise_progress(clerk_user_id, exercise_id, logged=logged)
    return success_envelope(_serialize(view))
