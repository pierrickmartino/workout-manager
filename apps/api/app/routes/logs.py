"""Session logging routes: record a performance of a Session and read history.

``POST /api/sessions/{id}/logs`` records a Logged Session — a performance of the
user's Session on a date, with its per-set typed Quantity, load, and perceived
difficulty.
You may only log a Session you own (``404`` otherwise); a set referencing an
unknown Exercise is rejected (``422``). ``GET /api/logs`` returns the user's
history, most recent first. All responses use the standard envelope."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.auth.dependencies import get_current_user
from app.domain.completion import parse_completion_outcome
from app.domain.load import LoadKind, load_from_input
from app.domain.quantity import QuantityKind, quantity_from_input
from app.envelope import success_envelope
from app.logbook.correction import (
    ContiguityError,
    CorrectSessionRequest,
    LogNotFoundError,
    correct_session,
    delete_session,
)
from app.logbook.service import (
    LogKindError,
    LogSessionRequest,
    SessionNotOwnedError,
    UnknownExerciseError,
    log_session,
)
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)
from app.repositories.profile_repository import ProfileRepository
from app.repositories.protocol_repository import ProtocolRepository
from app.repositories.session_repository import SessionRepository

router = APIRouter(prefix="/api", tags=["logs"])

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422

MIN_RPE = 1
MAX_RPE = 10

DEFAULT_LOAD_KIND = "absolute"
DEFAULT_QUANTITY_KIND = QuantityKind.REPETITIONS.value
DEFAULT_QUANTITY_UNIT = "km"


class LogSetBody(BaseModel):
    """One actual set performed, referencing the catalog Exercise.

    The amount is captured as a typed Quantity (ADR-0032): ``quantity_kind`` is the
    kind the user picked and ``quantity_value`` its value field (a rep count for
    ``repetitions``, a distance for ``distance``, a time for ``duration``), defaulting
    to the repetitions kind the log form has always sent. The load is captured as a
    typed Load (ADR-0010): ``load_kind`` is the kind the user picked and ``load_value``
    its value field (a number for ``absolute`` / ``percent_1rm``, a ``low-high`` pair
    for ``range``, the added kilograms for ``bodyweight``, free text for
    ``qualitative``). Each picked kind is authoritative, so the persisted set carries
    meaning at the write boundary, not a free-text string to be re-guessed."""

    exercise_id: int
    quantity_kind: str = DEFAULT_QUANTITY_KIND
    quantity_value: str | None = None
    # A ``distance`` Quantity's display unit (km or miles), canonicalised to metres on
    # the way in, and its optional companion time from which pace becomes derivable.
    # Both are inert for the other kinds — the repetitions the log form has always sent
    # carry neither (ADR-0032).
    quantity_unit: str = DEFAULT_QUANTITY_UNIT
    quantity_duration: str | None = None
    load_kind: str = DEFAULT_LOAD_KIND
    load_value: str | None = None
    perceived_difficulty: int | None = Field(default=None, ge=MIN_RPE, le=MAX_RPE)

    @field_validator("quantity_kind")
    @classmethod
    def _known_quantity_kind(cls, value: str) -> str:
        try:
            QuantityKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in QuantityKind)
            raise ValueError(f"quantity_kind must be one of: {allowed}") from exc
        return value

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
        quantity = quantity_from_input(
            self.quantity_kind,
            self.quantity_value,
            unit=self.quantity_unit,
            duration=self.quantity_duration,
        )
        return LoggedSetDraft(
            exercise_id=self.exercise_id,
            quantity=quantity.to_dict() if quantity is not None else None,
            load=parsed.to_dict() if parsed is not None else None,
            perceived_difficulty=self.perceived_difficulty,
        )


class LogSessionBody(BaseModel):
    """Validated request to record a performance of a Session.

    ``completion_outcome`` is the optional, client-declared Completion Outcome
    (ADR-0013): ``"completed"`` | ``"incomplete"``. Absent means the record does not
    declare one — the column stays null and the Session still advances the Protocol.

    ``duration_seconds`` is the optional recorded Session Duration (ADR-0014) — actual
    training time in whole seconds, measured start → last activity. Absent (the static
    form's path) leaves it null; a value can never run backwards, so it must be ≥ 0."""

    performed_on: date
    logged_sets: list[LogSetBody] = Field(min_length=1)
    completion_outcome: str | None = None
    duration_seconds: int | None = Field(default=None, ge=0)

    @field_validator("completion_outcome")
    @classmethod
    def _known_outcome(cls, value: str | None) -> str | None:
        if value is None:
            return None
        # Normalize and reject anything outside the vocabulary at the boundary.
        return parse_completion_outcome(value).value


def _serialize(view: LoggedSessionView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "session_id": view.session_id,
        "training_type": view.training_type,
        "performed_on": view.performed_on.isoformat(),
        "completion_outcome": view.completion_outcome,
        "duration_seconds": view.duration_seconds,
        "logged_sets": [
            {
                "position": s.position,
                "quantity": s.quantity,
                "load": s.load,
                "perceived_difficulty": s.perceived_difficulty,
                "exercise_id": s.exercise_id,
                "exercise_name": s.exercise_name,
                "body_weight_kg": s.body_weight_kg,
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
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    request = LogSessionRequest(
        session_id=session_id,
        performed_on=payload.performed_on,
        completion_outcome=payload.completion_outcome,
        duration_seconds=payload.duration_seconds,
        logged_sets=[s.to_draft() for s in payload.logged_sets],
    )
    try:
        view = log_session(
            request,
            clerk_user_id,
            sessions=sessions,
            exercises=exercises,
            logged=logged,
            profiles=profiles,
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


class LogAdhocBody(BaseModel):
    """Validated request to record a plan-less performance (ADR-0031).

    ``training_type`` is *required* and rides onto the record — a plan-less log has no
    Session to read it from (``cardio`` / ``strength`` / … as the client's picker
    offers). A Session id and a ``completion_outcome`` are *forbidden*: this route
    records no plan-backed work, so ``extra="forbid"`` rejects either as a boundary
    violation (``422``). An ad-hoc record therefore cannot gate a Protocol and has no
    Completion Outcome, by construction.

    ``duration_seconds`` is the optional recorded Session Duration (ADR-0014); the
    distance/duration Quantity kinds are a later slice, so a set here still carries the
    default repetitions Quantity like the plan-backed form."""

    model_config = ConfigDict(extra="forbid")

    performed_on: date
    training_type: str = Field(min_length=1)
    logged_sets: list[LogSetBody] = Field(min_length=1)
    duration_seconds: int | None = Field(default=None, ge=0)


@router.post("/logs")
def create_adhoc_log(
    payload: LogAdhocBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    """Record a plan-less Logged Session — no Session id in the path (ADR-0031).

    Funnels into the same ``log_session`` service as the plan-backed route, so the
    catalog-validity guard and the Performed-Body-Weight snapshot are shared; only the
    Session-ownership guard is skipped (there is no Session). Boundary violations
    surface as ``422``."""

    request = LogSessionRequest(
        session_id=None,
        training_type=payload.training_type,
        performed_on=payload.performed_on,
        completion_outcome=None,
        duration_seconds=payload.duration_seconds,
        logged_sets=[s.to_draft() for s in payload.logged_sets],
    )
    try:
        view = log_session(
            request,
            clerk_user_id,
            sessions=sessions,
            exercises=exercises,
            logged=logged,
            profiles=profiles,
        )
    except (LogKindError, UnknownExerciseError) as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return success_envelope(_serialize(view))


class LogCorrectionBody(BaseModel):
    """Validated request to correct a Logged Session's contents (ADR-0034).

    Full-replace semantics: ``logged_sets`` carries the *entire* desired set list (at
    least one — a session always keeps a set) and the server replaces the record's sets
    wholesale. ``performed_on`` and ``duration_seconds`` are edited directly.

    ``training_type`` rides only on a plan-less correction — a plan-backed record keeps
    the type derived from its Session, so the value is ignored there.

    ``completion_outcome`` corrects the Completion Outcome of a plan-backed record
    (ADR-0013): ``"completed"`` | ``"incomplete"``. Absent means "leave it unchanged" —
    the record's own outcome is preserved. Supplying one on a plan-less record is a
    boundary violation (``422``); flipping a plan-backed record to Incomplete is gated by
    contiguity (``409`` when it would leave a gap). Any body weight is ignored — the
    Performed Body Weight is carried forward from the record, never re-read (ADR-0034)."""

    performed_on: date
    logged_sets: list[LogSetBody] = Field(min_length=1)
    training_type: str | None = None
    completion_outcome: str | None = None
    duration_seconds: int | None = Field(default=None, ge=0)

    @field_validator("completion_outcome")
    @classmethod
    def _known_outcome(cls, value: str | None) -> str | None:
        if value is None:
            return None
        # Normalize and reject anything outside the vocabulary at the boundary.
        return parse_completion_outcome(value).value


@router.put("/logs/{log_id}")
def correct_log(
    log_id: int,
    payload: LogCorrectionBody,
    clerk_user_id: str = Depends(get_current_user),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
) -> dict:
    """Correct a Logged Session in place (ADR-0034).

    Delegates to the ``correct_session`` service, which resolves ownership, reads the
    plan-backed / plan-less boundary rule off the *existing* record (so no route split),
    guards catalog validity, carries the Performed Body Weight forward, and — when the
    Completion Outcome is corrected to Incomplete — runs the contiguity gate. A log that
    is not the caller's surfaces as ``404``; a boundary-rule or catalog violation as
    ``422``; an outcome flip that would leave a gap in the performed sequence as ``409``
    with a tail-first message. On success every read-time projection (advancement / Next
    Session, XP, PRs, Streak, Achievements) recomputes from the record on the next read."""

    request = CorrectSessionRequest(
        log_id=log_id,
        performed_on=payload.performed_on,
        training_type=payload.training_type,
        completion_outcome=payload.completion_outcome,
        duration_seconds=payload.duration_seconds,
        logged_sets=[s.to_draft() for s in payload.logged_sets],
    )
    try:
        view = correct_session(
            request,
            clerk_user_id,
            exercises=exercises,
            logged=logged,
            protocols=protocols,
        )
    except LogNotFoundError as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Log not found") from exc
    except ContiguityError as exc:
        raise HTTPException(status_code=HTTP_CONFLICT, detail=str(exc)) from exc
    except (LogKindError, UnknownExerciseError) as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return success_envelope(_serialize(view))


@router.delete("/logs/{log_id}")
def delete_log(
    log_id: int,
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
) -> dict:
    """Delete a Logged Session in place (ADR-0034).

    Delegates to ``delete_session``, which resolves ownership and runs the pure
    contiguity gate over the user's history and the parent Protocol's ordering. A log
    that is not the caller's surfaces as ``404``; a delete that would leave a gap in the
    performed sequence (a mid-Protocol Session with a later-positioned one performed) is
    refused as ``409`` with a tail-first message. On success the read-time projections
    (advancement / Next Session, XP, PRs, Streak, Achievements, analytics) recompute from
    the record on the next read."""

    try:
        delete_session(log_id, clerk_user_id, protocols=protocols, logged=logged)
    except LogNotFoundError as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Log not found") from exc
    except ContiguityError as exc:
        raise HTTPException(status_code=HTTP_CONFLICT, detail=str(exc)) from exc
    return success_envelope({"id": log_id})


@router.get("/logs")
def read_history(
    clerk_user_id: str = Depends(get_current_user),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    history = logged.list_for_user(clerk_user_id)
    return success_envelope([_serialize(view) for view in history])
