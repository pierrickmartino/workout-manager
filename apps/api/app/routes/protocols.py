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

from dataclasses import replace

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user
from app.domain.fitness_profile import is_sensitive, resolve_equipment
from app.domain.load import LoadKind, load_from_input
from app.envelope import error_envelope, success_envelope
from app.generation.orchestrator import GenerationOrchestrator
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.protocol_service import cache_request_for
from app.protocols.deploy import DeployStatus, deploy_protocol_tail
from app.protocols.deploy_validation import (
    MAX_SESSIONS_PER_WEEK,
    MAX_WEEKS,
    MIN_SESSIONS_PER_WEEK,
    MIN_WEEKS,
    DeployDraft,
    DeployError,
    DraftPrescription,
    DraftSession,
)
from app.protocols.balance_preview import build_balance_preview
from app.protocols.progress import progressed_protocol, protocol_progress
from app.protocols.serialization import (
    serialize_balance_preview,
    serialize_protocol_progress,
)
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
    sessions_per_week: int = Field(ge=MIN_SESSIONS_PER_WEEK, le=MAX_SESSIONS_PER_WEEK)
    duration_minutes: int = Field(ge=MIN_DURATION_MINUTES, le=MAX_DURATION_MINUTES)
    weeks: int = Field(ge=MIN_WEEKS, le=MAX_WEEKS)
    # Nullable so an *omitted* request inherits the Profile's Default Equipment,
    # while an explicitly empty list is honored as bodyweight-only (ADR-0038).
    equipment: list[str] | None = None

    def to_generation_request(self, equipment: list[str]) -> ProtocolGenerationRequest:
        return ProtocolGenerationRequest(
            training_type=self.training_type,
            objective=self.objective,
            sessions_per_week=self.sessions_per_week,
            duration_minutes=self.duration_minutes,
            weeks=self.weeks,
            equipment=equipment,
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

    profile = profiles.get_or_create(clerk_user_id)
    history = logged.list_for_user(clerk_user_id)
    # Resolve the Available Equipment once — the request's equipment, or the Profile's
    # Default Equipment when the request omits it (ADR-0038) — before building the
    # generation request, so both the AI call and the coarse cache key read the same
    # effective equipment (two requests with equal effective equipment still share the
    # cache).
    available_equipment = resolve_equipment(
        payload.equipment, profile.default_equipment
    )
    # A user with any Sensitive Constraint is never handed a Superset (ADR-0023): the
    # flag rides on the generation request so the prompt instructs none and the parse
    # boundary degrades any that slip through. It is derived from the stored constraint
    # types (the same gate as the cache bypass), never trusted from the client.
    params = replace(
        payload.to_generation_request(available_equipment),
        has_sensitive_constraint=is_sensitive(profile),
    )
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
    # Superset overlay (ADR-0023): the group tag members of one Superset share and the
    # group-owned round-rest. Both ``None`` for a flat, solo Prescription. Validated by
    # the shared Superset validator on the deploy gate.
    superset_group: str | None = None
    round_rest_seconds: int | None = None

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
    """One Session in the desired un-performed tail. ``session_id`` names the existing
    Session it edits, or is ``None`` for a newly-added empty slot (ADR-0020). ``week``
    is the slot's client-intended week — the grouping the server re-enumerates into
    positional labels; ``day`` orders Sessions within a week."""

    session_id: int | None = None
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
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> object:
    """Validate the desired un-performed tail and, on success, replace it in place.

    Ownership is verified (``404`` otherwise); the frozen performed prefix is enforced
    server-side by validation (ADR-0020), not merely by the client. A rejected draft
    returns a structured ``422`` naming the offending item(s) and persists nothing; a
    valid one is replaced atomically, and the progressed Protocol is returned in the
    standard envelope."""

    # Deserialize the wire body into the domain ``DeployDraft``, resolving each Load
    # once at the boundary (kind+value → typed dict, ADR-0010). The whole validate →
    # re-enumerate → persist pipeline lives behind ``deploy_protocol_tail`` (the Deploy
    # module), which owns the frozen-prefix rule (ADR-0020) and the Sensitive-Constraint
    # Superset safety gate (ADR-0023); the route only maps its outcome to a response.
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
                        superset_group=prescription.superset_group,
                        round_rest_seconds=prescription.round_rest_seconds,
                    )
                    for prescription in session.prescriptions
                ],
            )
            for session in payload.sessions
        ],
    )

    result = deploy_protocol_tail(
        clerk_user_id,
        protocol_id,
        draft,
        payload.normalized_name(),
        protocols=protocols,
        logged=logged,
        exercises=exercises,
        profiles=profiles,
    )
    if result.status is DeployStatus.NOT_FOUND:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Protocol not found")
    if result.status is DeployStatus.REJECTED:
        return _deploy_error_response(result.errors)
    return success_envelope(serialize_protocol_progress(result.view))


class SimulatePrescriptionBody(BaseModel):
    """The only two facts SIMULATE reads off a Prescription: which catalog Exercise it
    is (to roll its muscles up) and how many Sets it prescribes (the weight)."""

    exercise_id: int
    sets: int


class SimulateSessionBody(BaseModel):
    """One Session in the whole-plan simulate draft. ``week`` groups the per-week
    counts; a preview is non-committal, so nothing here is validated."""

    week: int
    prescriptions: list[SimulatePrescriptionBody] = Field(default_factory=list)


class SimulateProtocolBody(BaseModel):
    """The whole edited plan — performed prefix and un-performed tail alike — as the
    Builder previews it. It carries *every* Session so the per-week counts and the
    Muscle-Group split reflect the plan the user will actually deploy, unsaved edits
    included (ADR-0021), not just the frozen tail a DEPLOY would send."""

    weeks: int
    sessions_per_week: int
    sessions: list[SimulateSessionBody] = Field(default_factory=list)


@router.post("/protocols/{protocol_id}/simulate")
def simulate_protocol(
    protocol_id: int,
    payload: SimulateProtocolBody,
    clerk_user_id: str = Depends(get_current_user),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> dict:
    """Return a read-only, non-predictive balance preview of the draft (Module C).

    Ownership is verified (``404`` otherwise); nothing is written. Per-week Session/Set
    counts and the curated Muscle-Group distribution are computed over the whole draft,
    with each Exercise's muscles resolved from the shared catalog. No fatigue, recovery,
    projected volume, or 1RM curve is computed — the domain has no honest basis for one
    (ADR-0021)."""

    progress = protocol_progress(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    if progress is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Protocol not found")

    draft = DeployDraft(
        weeks=payload.weeks,
        sessions_per_week=payload.sessions_per_week,
        sessions=[
            DraftSession(
                session_id=None,
                week=session.week,
                day=0,
                prescriptions=[
                    DraftPrescription(
                        exercise_id=prescription.exercise_id,
                        sets=prescription.sets,
                        reps="",
                    )
                    for prescription in session.prescriptions
                ],
            )
            for session in payload.sessions
        ],
    )

    def resolve_muscles(exercise_id: int) -> list[str]:
        exercise = exercises.get(exercise_id)
        return list(exercise.targeted_muscles) if exercise is not None else []

    preview = build_balance_preview(draft, resolve_muscles=resolve_muscles)
    return success_envelope(serialize_balance_preview(preview))
