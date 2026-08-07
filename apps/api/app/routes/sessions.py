"""Session generation routes: create a standalone Session from the AI, and read
one back.

``POST /api/sessions/generate`` runs the first end-to-end AI path (Slice 3) —
validated request in, schema-constrained generation, catalog resolution, and a
persisted user-owned Session out. A malformed generation is surfaced as a
``502`` (an upstream AI failure), never silently persisted. ``GET
/api/sessions/{id}`` returns the owner's Session, ``404`` for anyone else. All
responses use the standard envelope."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user
from app.authoring.service import (
    AuthoredSessionInvalid,
    AuthorSessionRequest,
    author_and_log_session,
)
from app.domain.feedback import parse_verdict
from app.domain.fitness_profile import is_sensitive, resolve_equipment
from app.domain.load import LoadKind, load_from_input
from app.domain.session_provenance import SessionProvenance
from app.envelope import error_envelope, success_envelope
from app.generation.generator import (
    GenerationError,
    GenerationRequest,
    SessionGenerator,
)
from app.generation.regeneration_service import (
    RegenerationNotAllowed,
    RegenerationRequiresNegativeFeedback,
    SessionNotFound,
    regenerate_session,
)
from app.generation.regenerator import SessionRegenerator
from app.generation.service import generate_session
from app.generation.substitute_generator import SubstituteGenerator
from app.live.hydration import hydrate_session
from app.live.serialization import serialize_hydrated_session
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_generation_feedback_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_regenerator,
    get_session_repository,
    get_substitute_generator,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
    GenerationFeedbackView,
)
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import (
    PrescriptionDraft,
    SessionRepository,
    SessionView,
)
from app.protocols.deploy_validation import DeployError
from app.routes.logs import LogSetBody, serialize_logged_session
from app.substitution.service import (
    HarderVariationSuggestion,
    PrescriptionNotFound,
    SubstituteNotAvailable,
    harder_variation_suggestion,
    substitute_exercise,
)
from app.substitution.service import SessionNotFound as SubstituteSessionNotFound

router = APIRouter(prefix="/api", tags=["sessions"])

HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422
HTTP_BAD_GATEWAY = 502

MIN_DURATION_MINUTES = 1
MAX_DURATION_MINUTES = 360


class GenerateSessionRequest(BaseModel):
    """Validated request for a standalone Session generation."""

    training_type: str = Field(min_length=1)
    duration_minutes: int = Field(ge=MIN_DURATION_MINUTES, le=MAX_DURATION_MINUTES)
    # Nullable so an *omitted* request inherits the Profile's Default Equipment,
    # while an explicitly empty list is honored as bodyweight-only (ADR-0038).
    equipment: list[str] | None = None

    def to_generation_request(
        self, equipment: list[str], *, has_sensitive_constraint: bool = False
    ) -> GenerationRequest:
        return GenerationRequest(
            training_type=self.training_type,
            duration_minutes=self.duration_minutes,
            equipment=equipment,
            has_sensitive_constraint=has_sensitive_constraint,
        )


def _serialize(view: SessionView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "duration_minutes": view.duration_minutes,
        "has_been_regenerated": view.has_been_regenerated,
        "provenance": view.provenance,
        "prescriptions": [
            {
                "position": p.position,
                "sets": p.sets,
                "reps": p.reps,
                "rest_seconds": p.rest_seconds,
                "tempo": p.tempo,
                "recommended_load": p.recommended_load,
                # Superset overlay (ADR-0023): the shared group tag and group-owned
                # round-rest, both null on a flat, solo Prescription. Exposed on the read
                # so a saved Superset renders on the Session detail.
                "superset_group": p.superset_group,
                "round_rest_seconds": p.round_rest_seconds,
                "exercise_id": p.exercise_id,
                "exercise_name": p.exercise_name,
                "exercise_description": p.exercise_description,
                "targeted_muscles": p.targeted_muscles,
                "required_equipment": p.required_equipment,
                "provenance": p.provenance,
            }
            for p in view.prescriptions
        ],
    }


DEFAULT_LOAD_KIND = "absolute"
# A Hand-Authored plan carries a nominal length only; the record's actual training time
# is not measured for a log-after-the-fact performance (ADR-0014), so this is a neutral
# placeholder used when the build-and-log screen sends none.
DEFAULT_AUTHORED_DURATION_MINUTES = 30


class AuthorPrescriptionBody(BaseModel):
    """One authored Exercise Prescription — the *plan* side of a Hand-Authored Session.

    Carries the sets/reps/rest/tempo and a typed Load (ADR-0010): ``load_kind`` is the
    kind the user picked and ``load_value`` its value field (a number for ``absolute`` /
    ``percent_1rm``, a ``low-high`` pair for ``range``, added kilograms for
    ``bodyweight``, free text for ``qualitative``). ``superset_group`` /
    ``round_rest_seconds`` overlay Supersets (ADR-0023, issue #289): both ``None`` for a
    flat, solo Prescription; members of one Superset share the group tag and carry the
    group-owned round-rest. The grouping is validated through the Builder's
    ``validate_deploy`` rules in the service, so a non-contiguous or singleton "superset"
    is rejected whole with nothing persisted."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    load_kind: str = DEFAULT_LOAD_KIND
    load_value: str | None = None
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

    def to_draft(self) -> PrescriptionDraft:
        parsed = load_from_input(self.load_kind, self.load_value)
        return PrescriptionDraft(
            exercise_id=self.exercise_id,
            sets=self.sets,
            reps=self.reps,
            rest_seconds=self.rest_seconds,
            tempo=self.tempo,
            recommended_load=parsed.to_dict() if parsed is not None else None,
            superset_group=self.superset_group,
            round_rest_seconds=self.round_rest_seconds,
        )


class AuthorSessionBody(BaseModel):
    """Validated request to author-and-log a Hand-Authored Session (ADR-0040).

    ``prescriptions`` are the authored plan and ``logged_sets`` the first performance
    (the log form's ``LogSetBody`` shape, reused). ``performed_on`` defaults to today on
    the client and is rejected when in the future. ``duration_minutes`` is the plan's
    nominal length — optional, since the build-and-log screen collects only performed
    work; a neutral default stands in when it is absent. Emptiness and catalog validity
    are checked in the service so a rejected request surfaces a structured ``422`` and
    persists nothing."""

    performed_on: date
    training_type: str = Field(min_length=1)
    duration_minutes: int | None = None
    prescriptions: list[AuthorPrescriptionBody] = Field(default_factory=list)
    logged_sets: list[LogSetBody] = Field(default_factory=list)


def _authored_error_response(errors: list[DeployError]) -> JSONResponse:
    """A structured ``422`` naming every offending item, so the client can fix and retry
    in one pass. Mirrors the DEPLOY endpoint's error shape; persists nothing."""

    body = error_envelope(errors[0].message)
    body["errors"] = [
        {"code": error.code, "message": error.message, "position": error.position}
        for error in errors
    ]
    return JSONResponse(status_code=HTTP_UNPROCESSABLE_ENTITY, content=body)


@router.post("/sessions")
def author_session(
    payload: AuthorSessionBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> object:
    """Author a ``user_authored`` standalone Session and log its first performance in one
    submit (ADR-0040).

    Delegates to ``author_and_log_session``, which validates the whole request before any
    write — the performed date is not in the future, the plan passes the Builder's deploy
    rules, and every performed set references a real catalog Exercise — then creates the
    plan and records its first Logged Session by reusing ``log_session``. A rejected
    request returns a structured ``422`` naming the offending item(s) and persists
    nothing. On success the standard envelope carries the new Logged Session, so the
    client can jump to it in History."""

    request = AuthorSessionRequest(
        performed_on=payload.performed_on,
        training_type=payload.training_type,
        duration_minutes=payload.duration_minutes or DEFAULT_AUTHORED_DURATION_MINUTES,
        prescriptions=[prescription.to_draft() for prescription in payload.prescriptions],
        logged_sets=[logged_set.to_draft() for logged_set in payload.logged_sets],
    )
    try:
        view = author_and_log_session(
            request,
            clerk_user_id,
            sessions=sessions,
            exercises=exercises,
            logged=logged,
            profiles=profiles,
        )
    except AuthoredSessionInvalid as exc:
        return _authored_error_response(exc.errors)
    return success_envelope(serialize_logged_session(view))


@router.post("/sessions/generate")
def generate(
    payload: GenerateSessionRequest,
    clerk_user_id: str = Depends(get_current_user),
    generator: SessionGenerator = Depends(get_session_generator),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    # A user with any Sensitive Constraint is never handed a Superset (ADR-0023): the
    # flag rides on the generation request so the prompt instructs none and the parse
    # boundary degrades any that slip through. Derived from stored constraint types.
    profile = profiles.get_or_create(clerk_user_id)
    # Resolve the Available Equipment once — the request's equipment, or the Profile's
    # Default Equipment when the request omits it (ADR-0038) — before generation.
    available_equipment = resolve_equipment(
        payload.equipment, profile.default_equipment
    )
    try:
        view = generate_session(
            payload.to_generation_request(
                available_equipment,
                has_sensitive_constraint=is_sensitive(profile),
            ),
            clerk_user_id,
            generator=generator,
            exercises=exercises,
            sessions=sessions,
        )
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="The workout could not be generated. Please try again.",
        ) from exc
    return success_envelope(_serialize(view))


@router.get("/sessions/{session_id}")
def read_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(_serialize(view))


@router.get("/sessions/{session_id}/live")
def hydrate_live_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """Return the owner's Session hydrated for the live screen (issue #90).

    The recommended loads carry the ADR-0004 Progression adjustment and each
    Exercise carries its previous performance to beat. ``404`` for anyone who does
    not own the Session, so non-owners never seed a Live Session.
    """

    view = hydrate_session(clerk_user_id, session_id, sessions=sessions, logged=logged)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(serialize_hydrated_session(view))


class FeedbackRequest(BaseModel):
    """A Generation Feedback verdict on a Session, with an optional reason."""

    verdict: str = Field(min_length=1)
    reason: str | None = Field(default=None)


def _serialize_feedback(view: GenerationFeedbackView) -> dict:
    return {
        "id": view.id,
        "session_id": view.session_id,
        "verdict": view.verdict,
        "reason": view.reason,
    }


@router.post("/sessions/{session_id}/feedback")
def record_feedback(
    session_id: int,
    payload: FeedbackRequest,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    feedback: GenerationFeedbackRepository = Depends(
        get_generation_feedback_repository
    ),
) -> dict:
    try:
        verdict = parse_verdict(payload.verdict)
    except ValueError as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail="verdict must be 'positive' or 'negative'.",
        ) from exc

    # Feedback is recorded only on the user's own Session.
    session_view = sessions.get(session_id, clerk_user_id)
    if session_view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")

    # Generation Feedback is an AI-only affordance (ADR-0040): "the AI gave me a bad plan"
    # is nonsensical on a plan the user wrote by hand, so a user_authored Session rejects it.
    if session_view.provenance == SessionProvenance.USER_AUTHORED.value:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="Generation feedback isn't available for a hand-authored session.",
        )

    view = feedback.record(
        clerk_user_id,
        session_id=session_id,
        verdict=verdict,
        reason=payload.reason,
    )
    return success_envelope(_serialize_feedback(view))


class RegenerateRequest(BaseModel):
    """Which Exercise Prescriptions to keep (0-based positions); the AI replaces
    the rest, steered by the Session's stored negative-feedback reason."""

    keep: list[int] = Field(default_factory=list)


@router.post("/sessions/{session_id}/regenerate")
def regenerate(
    session_id: int,
    payload: RegenerateRequest,
    clerk_user_id: str = Depends(get_current_user),
    regenerator: SessionRegenerator = Depends(get_session_regenerator),
    feedback: GenerationFeedbackRepository = Depends(
        get_generation_feedback_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    # Regeneration is an AI-only affordance (ADR-0040): a hand-authored plan was never
    # generated, so the AI can't redo it. Reject a user_authored Session before the
    # regeneration service runs; a missing/unowned Session still 404s from the service.
    session_view = sessions.get(session_id, clerk_user_id)
    if (
        session_view is not None
        and session_view.provenance == SessionProvenance.USER_AUTHORED.value
    ):
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A hand-authored session can't be regenerated.",
        )
    try:
        view = regenerate_session(
            session_id,
            clerk_user_id,
            payload.keep,
            regenerator=regenerator,
            feedback=feedback,
            exercises=exercises,
            sessions=sessions,
        )
    except SessionNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    except RegenerationNotAllowed as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="This Session has already been regenerated.",
        ) from exc
    except RegenerationRequiresNegativeFeedback as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="Leave negative feedback before regenerating this Session.",
        ) from exc
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="The Session could not be regenerated. Please try again.",
        ) from exc
    return success_envelope(_serialize(view))


class SubstituteBody(BaseModel):
    """The optional accept payload for a Substitution. ``target_exercise_id`` names a
    specific catalog Variation/Alternative to advance to — e.g. accepting the
    harder-Variation offer at the rep ceiling (#202). Omitted, the swap resolves
    automatically, lookup-first."""

    target_exercise_id: int | None = None


@router.post("/sessions/{session_id}/prescriptions/{position}/substitute")
def substitute(
    session_id: int,
    position: int,
    body: SubstituteBody | None = Body(default=None),
    clerk_user_id: str = Depends(get_current_user),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
    generator: SubstituteGenerator = Depends(get_substitute_generator),
) -> dict:
    target_exercise_id = body.target_exercise_id if body is not None else None
    try:
        view = substitute_exercise(
            session_id,
            clerk_user_id,
            position,
            target_exercise_id=target_exercise_id,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=generator,
        )
    except (SubstituteSessionNotFound, PrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    except SubstituteNotAvailable as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="That substitute is not available for this prescription.",
        ) from exc
    except GenerationError as exc:
        raise HTTPException(
            status_code=HTTP_BAD_GATEWAY,
            detail="No substitute could be found. Please try again.",
        ) from exc
    return success_envelope(_serialize(view))


def _serialize_suggestion(suggestion: HarderVariationSuggestion | None) -> dict:
    """The harder-Variation offer, or ``null`` when the prescription holds. The
    ``exercise_id`` is what the client POSTs back as ``target_exercise_id`` to accept.
    """

    return {
        "suggested_variation": (
            {"exercise_id": suggestion.exercise_id, "name": suggestion.name}
            if suggestion is not None
            else None
        )
    }


@router.get("/sessions/{session_id}/prescriptions/{position}/harder-variation")
def read_harder_variation(
    session_id: int,
    position: int,
    clerk_user_id: str = Depends(get_current_user),
    relationships: ExerciseRelationshipRepository = Depends(
        get_exercise_relationship_repository
    ),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> dict:
    """Offer the next harder Variation when this pure-bodyweight Prescription has hit
    its rep ceiling (#202), else ``null``. Read-only; accepting is a POST to
    ``/substitute`` with the returned ``exercise_id`` as ``target_exercise_id``."""

    try:
        suggestion = harder_variation_suggestion(
            session_id,
            clerk_user_id,
            position,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            logged=logged,
            profiles=profiles,
        )
    except (SubstituteSessionNotFound, PrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    return success_envelope(_serialize_suggestion(suggestion))
