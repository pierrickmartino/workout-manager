"""Session logging routes: record a performance of a Session and read history.

``POST /api/sessions/{id}/logs`` records a Logged Session — a performance of the
user's Session on a date, with its per-set reps, load, and perceived difficulty.
You may only log a Session you own (``404`` otherwise); a set referencing an
unknown Exercise is rejected (``422``). ``GET /api/logs`` returns the user's
history, most recent first. All responses use the standard envelope."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user
from app.domain.load import LoadKind, load_from_input
from app.envelope import success_envelope
from app.logbook.service import (
    LogSessionRequest,
    SessionNotOwnedError,
    UnknownExerciseError,
    log_session,
)
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)
from app.repositories.session_repository import SessionRepository

router = APIRouter(prefix="/api", tags=["logs"])

HTTP_NOT_FOUND = 404
HTTP_UNPROCESSABLE_ENTITY = 422

MIN_REPS = 0
MIN_RPE = 1
MAX_RPE = 10

DEFAULT_LOAD_KIND = "absolute"


class LogSetBody(BaseModel):
    """One actual set performed, referencing the catalog Exercise.

    The load is captured as a typed Load (ADR-0010): ``load_kind`` is the kind the
    user picked and ``load_value`` its value field (a number for ``absolute`` /
    ``percent_1rm``, a ``low-high`` pair for ``range``, the added kilograms for
    ``bodyweight``, free text for ``qualitative``). The picked kind is authoritative,
    so the persisted set carries meaning, not a free-text string to be re-guessed."""

    exercise_id: int
    reps: int = Field(ge=MIN_REPS)
    load_kind: str = DEFAULT_LOAD_KIND
    load_value: str | None = None
    perceived_difficulty: int | None = Field(default=None, ge=MIN_RPE, le=MAX_RPE)

    @field_validator("load_kind")
    @classmethod
    def _known_load_kind(cls, value: str) -> str:
        try:
            LoadKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in LoadKind)
            raise ValueError(f"load_kind must be one of: {allowed}") from exc
        return value

    def to_draft(self) -> LoggedSetDraft:
        parsed = load_from_input(self.load_kind, self.load_value)
        return LoggedSetDraft(
            exercise_id=self.exercise_id,
            reps=self.reps,
            load=parsed.to_dict() if parsed is not None else None,
            perceived_difficulty=self.perceived_difficulty,
        )


class LogSessionBody(BaseModel):
    """Validated request to record a performance of a Session."""

    performed_on: date
    logged_sets: list[LogSetBody] = Field(min_length=1)


def _serialize(view: LoggedSessionView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "session_id": view.session_id,
        "training_type": view.training_type,
        "performed_on": view.performed_on.isoformat(),
        "logged_sets": [
            {
                "position": s.position,
                "reps": s.reps,
                "load": s.load,
                "perceived_difficulty": s.perceived_difficulty,
                "exercise_id": s.exercise_id,
                "exercise_name": s.exercise_name,
            }
            for s in view.logged_sets
        ],
    }


@router.post("/sessions/{session_id}/logs")
def create_log(
    session_id: int,
    payload: LogSessionBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    request = LogSessionRequest(
        session_id=session_id,
        performed_on=payload.performed_on,
        logged_sets=[s.to_draft() for s in payload.logged_sets],
    )
    try:
        view = log_session(
            request,
            clerk_user_id,
            sessions=sessions,
            exercises=exercises,
            logged=logged,
        )
    except SessionNotOwnedError as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    except UnknownExerciseError as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return success_envelope(_serialize(view))


@router.get("/logs")
def read_history(
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    history = logged.list_for_user(clerk_user_id)
    return success_envelope([_serialize(view) for view in history])
