"""Protocol routes: generate-and-adopt a multi-week Protocol, and read it back with
its self-paced position.

``POST /api/protocols/generate`` runs the Slice 5 path — a validated full parameter
set in, a schema-constrained fully-enumerated generation, Adoption by deep copy,
and a persisted user-owned Protocol out. A malformed/under-enumerated generation is
surfaced as a ``502`` (an upstream AI failure), never silently persisted. ``GET
/api/protocols/{id}`` returns the owner's Protocol joined to its *next un-performed
Session* (self-paced, no calendar), with each upcoming Prescription's recommended
load progressed from the user's Logged Sets (ADR-0004); ``404`` for anyone else.
All responses use the standard envelope."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user
from app.domain.load import LoadKind, load_from_input
from app.envelope import error_envelope, success_envelope
from app.generation.orchestrator import GenerationOrchestrator
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.protocol_service import cache_request_for
from app.protocols.deploy_validation import (
    MAX_SESSIONS_PER_WEEK,
    MAX_WEEKS,
    MIN_SESSIONS_PER_WEEK,
    MIN_WEEKS,
    DeployDraft,
    DeployError,
    DraftPrescription,
    DraftSession,
    validate_deploy,
)
from app.protocols.progress import progressed_protocol, protocol_progress
from app.protocols.serialization import serialize_protocol_progress
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_orchestrator,
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.protocol_repository import ProtocolRepository
from app.repositories.session_repository import PrescriptionDraft

router = APIRouter(prefix="/api", tags=["protocols"])

HTTP_NOT_FOUND = 404
HTTP_ACCEPTED = 202
HTTP_UNPROCESSABLE_ENTITY = 422

# ``weeks`` / ``sessions_per_week`` bounds are shared with deploy validation so the
# generate and deploy paths accept the same plan shape (single source of truth).
MIN_DURATION_MINUTES = 1
MAX_DURATION_MINUTES = 360

DEFAULT_LOAD_KIND = "absolute"


class GenerateProtocolRequest(BaseModel):
    """Validated request for a multi-week Protocol generation (full parameter set)."""

    training_type: str = Field(min_length=1)
    objective: str = Field(min_length=1)
    sessions_per_week: int = Field(
        ge=MIN_SESSIONS_PER_WEEK, le=MAX_SESSIONS_PER_WEEK
    )
    duration_minutes: int = Field(ge=MIN_DURATION_MINUTES, le=MAX_DURATION_MINUTES)
    weeks: int = Field(ge=MIN_WEEKS, le=MAX_WEEKS)
    equipment: list[str] = Field(default_factory=list)

    def to_generation_request(self) -> ProtocolGenerationRequest:
        return ProtocolGenerationRequest(
            training_type=self.training_type,
            objective=self.objective,
            sessions_per_week=self.sessions_per_week,
            duration_minutes=self.duration_minutes,
            weeks=self.weeks,
            equipment=self.equipment,
        )


def _job_payload(
    *, status: str, job_id: str | None, protocol_id: int | None, error: str | None
) -> dict:
    """The uniform generation-job envelope the PWA polls.

    A cache hit returns ``status=complete`` with the adopted ``protocol_id`` and no
    ``job_id``; a miss/bypass returns ``status=pending`` with a ``job_id`` to poll
    until ``protocol_id`` is filled in (or ``status=failed``).
    """

    return {
        "status": status,
        "job_id": job_id,
        "protocol_id": protocol_id,
        "error": error,
    }


@router.post("/protocols/generate")
def generate(
    payload: GenerateProtocolRequest,
    response: Response,
    clerk_user_id: str = Depends(get_current_user),
    orchestrator: GenerationOrchestrator = Depends(get_generation_orchestrator),
    profiles: ProfileRepository = Depends(get_profile_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """Submit a Protocol generation off the request path (ADR-0005).

    On a cache hit the Protocol is Adopted inline and returned with ``200``; on a
    miss or Sensitive-Constraint bypass a job is enqueued and a ``202`` handle is
    returned for the PWA to poll. Nothing blocks on the AI here.

    The cache key uses the user's Fitness Level with sustained strong logged
    progress folded in (ADR-0004), so a user who has progressed keys into the right
    difficulty for their next Protocol.
    """

    params = payload.to_generation_request()
    profile = profiles.get_or_create(clerk_user_id)
    history = logged.list_for_user(clerk_user_id)
    outcome = orchestrator.submit(
        params, clerk_user_id, cache_request_for(params, profile, history)
    )

    if outcome.protocol is not None:  # cache hit — instant
        return success_envelope(
            _job_payload(
                status="complete",
                job_id=None,
                protocol_id=outcome.protocol.id,
                error=None,
            )
        )

    response.status_code = HTTP_ACCEPTED
    return success_envelope(
        _job_payload(
            status="pending", job_id=outcome.job_id, protocol_id=None, error=None
        )
    )


@router.get("/protocols/jobs/{job_id}")
def read_job(
    job_id: str,
    clerk_user_id: str = Depends(get_current_user),
    orchestrator: GenerationOrchestrator = Depends(get_generation_orchestrator),
) -> dict:
    """Poll a generation job. The adopted ``protocol_id`` appears on completion;
    the owner-guarded ``GET /protocols/{id}`` then returns the full Protocol."""

    state = orchestrator.job_state(job_id)
    if state is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Job not found")
    return success_envelope(
        _job_payload(
            status=state.status.value,
            job_id=job_id,
            protocol_id=state.protocol_id,
            error=state.error,
        )
    )


@router.get("/protocols/{protocol_id}")
def read_protocol(
    protocol_id: int,
    clerk_user_id: str = Depends(get_current_user),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    progress = progressed_protocol(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    if progress is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Protocol not found")
    return success_envelope(serialize_protocol_progress(progress))


class DeployPrescriptionBody(BaseModel):
    """One Prescription in the desired tail. The Load is captured as the log form's
    typed kind+value (ADR-0010) and resolved server-side through ``load_from_input``,
    so the Builder and the log form speak one Load language."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    load_kind: str = DEFAULT_LOAD_KIND
    load_value: str | None = None

    @field_validator("load_kind")
    @classmethod
    def _known_load_kind(cls, value: str) -> str:
        try:
            LoadKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in LoadKind)
            raise ValueError(f"load_kind must be one of: {allowed}") from exc
        return value

    def resolved_load(self) -> dict | None:
        parsed = load_from_input(self.load_kind, self.load_value)
        return parsed.to_dict() if parsed is not None else None


class DeploySessionBody(BaseModel):
    """One Session in the desired un-performed tail, naming the existing Session it
    edits by ``session_id``."""

    session_id: int
    week: int
    day: int
    prescriptions: list[DeployPrescriptionBody] = Field(default_factory=list)


class DeployProtocolBody(BaseModel):
    """The desired un-performed tail plus the plan shape, staged client-side and
    committed atomically by ``DEPLOY PROTOCOL`` (ADR-0020).

    ``name`` is the config panel's user-editable Protocol name (ADR-0021). It rides
    through this same DEPLOY write rather than a separate call; a blank/whitespace
    value is normalized to ``None`` so the Protocol falls back to its derived label.
    """

    weeks: int
    sessions_per_week: int
    name: str | None = None
    sessions: list[DeploySessionBody] = Field(default_factory=list)

    def normalized_name(self) -> str | None:
        if self.name is None or not self.name.strip():
            return None
        return self.name.strip()


def _deploy_error_response(errors: list[DeployError]) -> JSONResponse:
    """A structured 4xx naming every offending item, so the client can fix and retry
    in one pass. Persists nothing."""

    body = error_envelope(errors[0].message)
    body["errors"] = [
        {
            "code": error.code,
            "message": error.message,
            "session_id": error.session_id,
            "position": error.position,
        }
        for error in errors
    ]
    return JSONResponse(status_code=HTTP_UNPROCESSABLE_ENTITY, content=body)


@router.post("/protocols/{protocol_id}/deploy")
def deploy_protocol(
    protocol_id: int,
    payload: DeployProtocolBody,
    clerk_user_id: str = Depends(get_current_user),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> object:
    """Validate the desired un-performed tail and, on success, replace it in place.

    Ownership is verified (``404`` otherwise); the frozen performed prefix is enforced
    server-side by validation (ADR-0020), not merely by the client. A rejected draft
    returns a structured ``422`` naming the offending item(s) and persists nothing; a
    valid one is replaced atomically, and the progressed Protocol is returned in the
    standard envelope."""

    progress = protocol_progress(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    if progress is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Protocol not found")

    performed = set(progress.performed_session_ids)
    known = {session.session_id for session in progress.protocol.sessions}

    # Resolve each Load once (kind+value → typed dict), reused for both validation and
    # persistence so the two never diverge.
    draft = DeployDraft(
        weeks=payload.weeks,
        sessions_per_week=payload.sessions_per_week,
        sessions=[
            DraftSession(
                session_id=session.session_id,
                week=session.week,
                day=session.day,
                prescriptions=[
                    DraftPrescription(
                        exercise_id=prescription.exercise_id,
                        sets=prescription.sets,
                        reps=prescription.reps,
                        rest_seconds=prescription.rest_seconds,
                        tempo=prescription.tempo,
                        recommended_load=prescription.resolved_load(),
                    )
                    for prescription in session.prescriptions
                ],
            )
            for session in payload.sessions
        ],
    )

    errors = validate_deploy(
        draft,
        performed_session_ids=performed,
        known_session_ids=known,
        exercise_exists=lambda exercise_id: exercises.get(exercise_id) is not None,
    )
    if errors:
        return _deploy_error_response(errors)

    session_prescriptions = {
        session.session_id: [
            PrescriptionDraft(
                exercise_id=prescription.exercise_id,
                sets=prescription.sets,
                reps=prescription.reps,
                rest_seconds=prescription.rest_seconds,
                tempo=prescription.tempo,
                recommended_load=prescription.recommended_load,
            )
            for prescription in session.prescriptions
        ]
        for session in draft.sessions
        if session.session_id is not None
    }
    protocols.replace_tail(
        protocol_id,
        clerk_user_id,
        session_prescriptions=session_prescriptions,
        name=payload.normalized_name(),
    )

    updated = progressed_protocol(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    return success_envelope(serialize_protocol_progress(updated))
