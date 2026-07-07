"""Records route: the per-exercise stat-header figures the Exercise Detail shows.

``GET /api/exercises/{exercise_id}/records`` returns the user's Personal Record (the
highest Estimated 1RM, or ``null`` when the Exercise has no absolute-Load history) and
Total Sets (a count of their Logged Sets) for a single Exercise, under the standard
envelope. It is read-only over the *record* side — no plan is read or mutated, no AI
runs — and reuses the shipped Estimated-1RM / Personal-Record engine (ADR-0010). Reads
are scoped to the owning user. Later F6 slices extend this endpoint with the top-set
series and PR milestones (F6 Slice 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.logbook.exercise_records import ExerciseRecordsView, exercise_records
from app.repositories.deps import get_logged_session_repository
from app.repositories.logged_session_repository import LoggedSessionRepository

router = APIRouter(prefix="/api", tags=["records"])


def _serialize(view: ExerciseRecordsView) -> dict:
    return {
        "exercise_id": view.exercise_id,
        "exercise_name": view.exercise_name,
        "personal_record": view.personal_record,
        "total_sets": view.total_sets,
    }


@router.get("/exercises/{exercise_id}/records")
def read_exercise_records(
    exercise_id: int,
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    view = exercise_records(clerk_user_id, exercise_id, logged=logged)
    return success_envelope(_serialize(view))
