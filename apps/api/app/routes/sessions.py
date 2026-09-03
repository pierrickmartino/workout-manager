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

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from app.auth.dependencies import get_current_user
from app.authoring.service import (
    AuthoredSessionInvalid,
    AuthorPlanRequest,
    AuthorSessionRequest,
    InsertTargetNotFound,
    RemoveTargetNotFound,
    author_and_log_session,
    author_plan,
    insert_prescription,
    remove_prescription,
)
from app.domain.feedback import parse_verdict
from app.domain.fitness_profile import is_sensitive, resolve_equipment
from app.domain.load import LoadKind, load_from_input
from app.domain.note import parse_note
from app.domain.progression import ProgressionScheme, parse_scheme
from app.domain.quantity import QuantityKind, prescribed_quantity_from_input
from app.domain.session_naming import session_label
from app.domain.session_provenance import SessionProvenance
from app.domain.set_type import SetType, parse_set_type
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
from app.session_serialization import serialize_session
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_generation_feedback_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_regenerator,
    get_session_repository,
    get_share_link_repository,
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
    SessionSummaryView,
    SessionView,
)
from app.repositories.share_link_repository import ShareLinkRepository
from app.sessions.service import (
    SessionHasLoggedSessions,
    SessionNotStandalone,
    delete_session,
)
from app.sessions.service import SessionNotFound as SessionServiceNotFound
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
from app.scheme_selection.service import (
    IncompatibleScheme,
    SchemeNotOnProtocolMember,
    clear_scheme,
    set_scheme,
)
from app.scheme_selection.service import (
    PrescriptionNotFound as SchemePrescriptionNotFound,
)
from app.scheme_selection.service import SessionNotFound as SchemeSessionNotFound

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


# The canonical standalone-Session JSON shape now lives in ``app.session_serialization`` so
# the Redeem read (``routes/shares.py``) returns byte-for-byte the same shape (ADR-0057). Kept
# under the local name every handler below already calls.
_serialize = serialize_session


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
    is rejected whole with nothing persisted.

    ``quantity_kind`` / ``quantity_unit`` carry the amount picker's choice (ADR-0050,
    issue #345): the kind the user picked for this exercise (``repetitions`` / ``distance``
    / ``duration``) and, for a distance, its unit. They type the plan's Prescribed Quantity
    at the write boundary so a "Distance / 5 km" the user authored is *saved* a distance
    rather than dropped to a free-text target that loses its input on reuse. Both are
    optional: an older client that omits them still types the plan by inferring the kind
    from the free-text ``reps`` target, exactly as the backfill migration does."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    load_kind: str = DEFAULT_LOAD_KIND
    load_value: str | None = None
    quantity_kind: str | None = None
    quantity_unit: str | None = None
    superset_group: str | None = None
    round_rest_seconds: int | None = None
    # Set Type annotation (ADR-0065, #449): a chosen ``SetType`` value, or ``None``/blank
    # for "unset" (reads as working). Descriptive only — echoed back on the Prescription,
    # never a Progression input. Membership is checked at the boundary and never coerced.
    set_type: str | None = None
    # Exercise Note (ADR-0065, #451): an optional plan-side coaching cue, or ``None``/blank for
    # "no note". Sanitized at the boundary by ``parse_note`` (below): blank → unset, over-cap →
    # 422, else stripped + HTML-escaped so the stored value is inert wherever it renders.
    note: str | None = None

    @field_validator("load_kind")
    @classmethod
    def _known_load_kind(cls, value: str) -> str:
        try:
            LoadKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in LoadKind)
            raise ValueError(f"load_kind must be one of: {allowed}") from exc
        return value

    @field_validator("quantity_kind")
    @classmethod
    def _known_quantity_kind(cls, value: str | None) -> str | None:
        # A blank/absent pick is tolerated — the free-text target's prose is inferred
        # instead; an explicit but unknown kind is a client bug, rejected at the boundary.
        if value is None or value == "":
            return value
        try:
            QuantityKind(value)
        except ValueError as exc:
            allowed = ", ".join(kind.value for kind in QuantityKind)
            raise ValueError(f"quantity_kind must be one of: {allowed}") from exc
        return value

    @field_validator("set_type")
    @classmethod
    def _known_set_type(cls, value: str | None) -> str | None:
        # A blank/absent Set Type is "unset" and normalizes to ``None`` (reads as working);
        # a present but unknown value is a client bug rejected at the boundary, never coerced.
        if value is None or value == "":
            return None
        if parse_set_type(value) is None:
            allowed = ", ".join(member.value for member in SetType)
            raise ValueError(f"set_type must be one of: {allowed}")
        return value

    @field_validator("note")
    @classmethod
    def _sanitize_note(cls, value: str | None) -> str | None:
        # Sanitize the Exercise Note at the write boundary (ADR-0065): blank → unset (None),
        # over-cap → 422 (``NoteTooLongError`` is a ``ValueError``), else stripped + HTML-escaped
        # so it is inert wherever it renders (nonce-CSP DOM-XSS posture, ADR-0036). Escaping here
        # (not on copy) keeps carry-forward from double-escaping a note that is copied verbatim.
        return parse_note(value)

    def to_draft(self) -> PrescriptionDraft:
        parsed = load_from_input(self.load_kind, self.load_value)
        # Type the plan's Prescribed Quantity at the write boundary (ADR-0050): the picked
        # kind is authoritative, falling back to inference over the free-text target when the
        # pick is absent or can't type the target — the same shared primitive generation and
        # the backfill use, so an authored plan is born typed like any other.
        prescribed_quantity = prescribed_quantity_from_input(
            self.quantity_kind,
            self.reps,
            unit=self.quantity_unit or "km",
        )
        return PrescriptionDraft(
            exercise_id=self.exercise_id,
            sets=self.sets,
            reps=self.reps,
            rest_seconds=self.rest_seconds,
            tempo=self.tempo,
            recommended_load=parsed.to_dict() if parsed is not None else None,
            prescribed_quantity=prescribed_quantity.to_dict(),
            superset_group=self.superset_group,
            round_rest_seconds=self.round_rest_seconds,
            set_type=self.set_type,
            note=self.note,
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


class AuthorPlanBody(BaseModel):
    """Validated request to author a standalone plan **without logging** (Capture, ADR-0044).

    The plan half of a Hand-Authored Session — ``prescriptions`` only, no performed sets and
    no date. Capture promotes an existing plan-less record into a reusable plan, so it
    creates the plan alone and never logs a second performance. ``duration_minutes`` is the
    plan's nominal length; a neutral default stands in when the client sends none. Emptiness
    and catalog validity are checked in the service, so a rejected request surfaces a
    structured ``422`` and persists nothing."""

    training_type: str = Field(min_length=1)
    duration_minutes: int | None = None
    prescriptions: list[AuthorPrescriptionBody] = Field(default_factory=list)


@router.post("/sessions/plan")
def author_plan_only(
    payload: AuthorPlanBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> object:
    """Author a ``user_authored`` standalone plan without logging (Capture, ADR-0044).

    The submit target of Capture's pre-filled builder: it creates **only** the plan — the
    source record already exists, so no performance is logged and no read-time projection
    (XP, Streak, Personal Records, Achievements) is inflated. Delegates to ``author_plan``,
    which validates the plan through the Builder's deploy rules before any write. A rejected
    request returns a structured ``422`` naming the offending item(s) and persists nothing;
    on success the envelope carries the new standalone Session so the client can jump to it."""

    request = AuthorPlanRequest(
        training_type=payload.training_type,
        duration_minutes=payload.duration_minutes or DEFAULT_AUTHORED_DURATION_MINUTES,
        prescriptions=[prescription.to_draft() for prescription in payload.prescriptions],
    )
    try:
        view = author_plan(
            request,
            clerk_user_id,
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )
    except AuthoredSessionInvalid as exc:
        return _authored_error_response(exc.errors)
    return success_envelope(_serialize(view))


@router.post("/sessions/{session_id}/prescriptions")
def insert_prescription_into_session(
    session_id: int,
    payload: AuthorPrescriptionBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    profiles: ProfileRepository = Depends(get_profile_repository),
) -> object:
    """Append one hand-authored Exercise Prescription to the owner's standalone Session
    (Insert, ADR-0051).

    The submit target of the Session detail's "Add exercise" affordance: it appends a
    single prescription — exercise id + sets + typed Quantity + rest + tempo + typed
    Load — at the end of the Session, with no AI call. Delegates to
    ``insert_prescription``, which validates the whole add before any write. A
    Protocol-member target, an unknown Exercise, or a ``validate_deploy`` failure returns
    a structured ``422`` naming the offending item and persists nothing; a missing or
    unowned Session ``404``s so a non-owner can never edit another user's plan. On
    success the envelope carries the updated Session with the new prescription last —
    its Session Provenance unchanged and its Logged Sessions frozen (ADR-0001/0041)."""

    try:
        view = insert_prescription(
            session_id,
            clerk_user_id,
            payload.to_draft(),
            sessions=sessions,
            exercises=exercises,
            profiles=profiles,
        )
    except InsertTargetNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    except AuthoredSessionInvalid as exc:
        return _authored_error_response(exc.errors)
    return success_envelope(_serialize(view))


@router.delete("/sessions/{session_id}/prescriptions/{position}")
def remove_prescription_from_session(
    session_id: int,
    position: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> object:
    """Withdraw one Exercise Prescription from the owner's standalone Session (Remove,
    ADR-0052) — Insert's symmetric partner.

    The submit target of the Session detail's per-row "Remove" affordance. Delegates to
    ``remove_prescription``, which guards the whole remove before any write. A
    Protocol-member target or a last-remaining prescription returns a structured ``422``
    naming the offending guard and persists nothing; a missing/unowned Session or a
    position with no prescription ``404``s, so a non-owner can never edit another user's
    plan. On success the envelope carries the updated Session with the survivors
    re-numbered contiguous — Session Provenance unchanged and Logged Sessions frozen
    (ADR-0001/0041)."""

    try:
        view = remove_prescription(
            session_id,
            clerk_user_id,
            position,
            sessions=sessions,
        )
    except RemoveTargetNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    except AuthoredSessionInvalid as exc:
        return _authored_error_response(exc.errors)
    return success_envelope(_serialize(view))


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


# The My Sessions library page bounds (issue #397): a sensible default page and a cap so
# one read never returns an unbounded slice of a user's library, mirroring the Exercise
# Library's ``DEFAULT_SEARCH_LIMIT`` / ``MAX_SEARCH_LIMIT``.
DEFAULT_LIST_LIMIT = 20
MAX_LIST_LIMIT = 100


def _serialize_summary(summary: SessionSummaryView, logged_count: int) -> dict:
    """One My Sessions row (issue #397): the same name/fallback and Author shapes the
    detail read uses, kept thin (no prescriptions). ``created_at`` is sent as its calendar
    date — the exact string the derived fallback label embeds — so the web view-model can
    reproduce the fallback for client-side search with parity to the server. ``logged_count``
    is the read-time **Logged Count** (ADR-0063): how many Logged Sessions were recorded
    against this Session — the counter the row badges, and the fact that gates Delete."""

    return {
        "id": summary.id,
        "training_type": summary.training_type,
        # The raw Session Name (``null`` when unnamed) plus the never-blank display label the
        # shared fallback resolves — identical to the detail read's ``_serialize``.
        "name": summary.name,
        "display_name": session_label(
            summary.name, summary.training_type, summary.created_at
        ),
        "created_at": summary.created_at.date().isoformat(),
        # Author surfaced as the raw credit name (``null`` when unset); the web
        # ``sessionAuthorView`` mapper resolves the never-blank generic fallback.
        "author": {"display_name": summary.author_display_name},
        # The owner's Favorite marker, driving the favorites-only filter's rendering.
        "is_favorite": summary.is_favorite,
        # The Logged Count (ADR-0063): the row badges it when > 0 and hides Delete then.
        "logged_count": logged_count,
    }


@router.get("/sessions")
def list_sessions(
    query: str = Query(default="", description="Search over name, fallback label, type."),
    favorites: bool = Query(default=False, description="Narrow to Favorites only."),
    limit: int = Query(default=DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(default=0, ge=0),
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    """List the caller's own **standalone** Sessions for My Sessions (issue #397).

    The read behind the My Sessions library (CONTEXT: My Sessions): scoped to the
    authenticated user and to standalone Sessions only — a Protocol-member Session and
    every other user's Session are excluded. ``query`` searches Session Name, the derived
    ``training_type · date`` fallback label, and Training Type case-insensitively (a blank
    or whitespace-only query returns the full list); ``favorites`` narrows to the owner's
    Favorites; the two **combine**. Results are newest-first and paginated through the
    envelope ``meta`` (``total`` counts every match across pages). Each row carries its
    read-time **Logged Count** (ADR-0063), read once for the whole library. Read-only —
    listing never creates a Session. Declared before ``/sessions/{session_id}`` so the
    literal path is never mistaken for an id."""

    page = sessions.list_standalone(
        clerk_user_id,
        query=query,
        favorites_only=favorites,
        limit=limit,
        offset=offset,
    )
    # One Logged-Count read for the whole library (ADR-0063), so badging every row never
    # fans out into a per-Session count query. A Session the user has never performed is
    # absent from the map and reads as zero.
    counts = logged.count_by_session(clerk_user_id)
    return success_envelope(
        [
            _serialize_summary(summary, counts.get(summary.id, 0))
            for summary in page.items
        ],
        meta={"total": page.total, "limit": limit, "offset": offset},
    )


@router.get("/sessions/{session_id}")
def read_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
) -> dict:
    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    # The read-time Logged Count (ADR-0063) rides the detail read like Favorite/Author, so
    # the Session view can offer Delete (count 0) or show it disabled with a hint (count > 0).
    logged_count = logged.count_for_session(clerk_user_id, session_id)
    return success_envelope(_serialize(view, logged_count=logged_count))


@router.delete("/sessions/{session_id}")
def delete_session_endpoint(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    shares: ShareLinkRepository = Depends(get_share_link_repository),
    feedback: GenerationFeedbackRepository = Depends(
        get_generation_feedback_repository
    ),
) -> dict:
    """Permanently delete the owner's standalone Session (Delete, ADR-0063).

    The submit target of the My Sessions row's and the Session detail's Delete control.
    Delegates to :func:`delete_session`, which guards before any write: a Session with any
    Logged Session is settled record and is refused with ``409`` (the guard is
    authoritative, so a performance that lands after the client drew the list turns the
    delete into a conflict rather than a lost record); a Protocol member is refused with
    ``409`` (standalone-only, like Rename/Favorite/Share); a missing or non-owned Session
    ``404``s. On success the Session and its plan-side dependents — Prescriptions, the
    Favorite marker, Generation Feedback, and Share Links — are gone, and the envelope
    carries the deleted id."""

    try:
        delete_session(
            session_id,
            clerk_user_id,
            sessions=sessions,
            logged=logged,
            shares=shares,
            feedback=feedback,
        )
    except SessionNotStandalone as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A session inside a protocol can't be deleted.",
        ) from exc
    except SessionHasLoggedSessions as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A session with logged training can't be deleted.",
        ) from exc
    except SessionServiceNotFound as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Session not found"
        ) from exc
    return success_envelope({"id": session_id})


@router.post("/sessions/{session_id}/duplicate")
def duplicate_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    """Deep-copy the owner's Session into a new standalone Session (Duplicate, ADR-0043).

    The copy carries the source's prescriptions, Supersets, Session Provenance, and
    ``trace_id`` lineage, but no records and no Protocol position — so it stands alone
    with a fresh regeneration budget, ready to tweak and log. ``404`` for anyone who
    does not own the source, so a non-owner can never copy another user's plan."""

    view = sessions.duplicate(session_id, clerk_user_id)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(_serialize(view))


MAX_SESSION_NAME_LENGTH = 120


class RenameSessionRequest(BaseModel):
    """The new Session Name, or ``null``/blank to clear it back to born-unnamed.

    ``name`` is validated at the boundary (length-capped) and normalized before the
    write: surrounding whitespace is trimmed and an empty/whitespace-only value becomes
    ``None`` (the clear), so the stored name is never a blank string that would defeat
    the derived-label fallback."""

    name: str | None = Field(default=None, max_length=MAX_SESSION_NAME_LENGTH)

    def normalized_name(self) -> str | None:
        if self.name is None or not self.name.strip():
            return None
        return self.name.strip()


@router.put("/sessions/{session_id}/name")
def rename_session(
    session_id: int,
    payload: RenameSessionRequest,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    """Set, edit, or clear the owner's Session Name (rename, issue #394).

    The submit target of the standalone Session's rename control. Renaming touches the
    *plan* only — no Logged Session is rewritten or reordered (ADR-0001) — and an
    empty/whitespace name clears it, so the read falls back to the derived
    ``training_type · date`` label. Offered on **standalone Sessions only**: a
    Protocol-member Session is rejected with ``409`` (its Week/Day ``title`` is a
    different concept). ``404`` for anyone who does not own the Session, so a non-owner
    can never rename another user's plan. On success the envelope carries the updated
    Session with its new ``name``/``display_name``."""

    session_view = sessions.get(session_id, clerk_user_id)
    if session_view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    if session_view.is_protocol_member:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A session inside a protocol can't be renamed.",
        )

    view = sessions.set_name(session_id, clerk_user_id, payload.normalized_name())
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(_serialize(view))


def _set_favorite(
    session_id: int, clerk_user_id: str, favorite: bool, sessions: SessionRepository
) -> dict:
    """Mark or unmark the owner's standalone Session as a Favorite (CONTEXT: Favorite, #396).

    The shared body of the mark (POST) and unmark (DELETE) endpoints. Scoped to the
    authenticated owner: a missing or non-owned Session ``404``s, so a non-owner can never
    favorite (or read the marker on) another user's plan. Offered on **standalone Sessions
    only** — a Protocol-member Session is rejected with ``409`` (Favorite is a standalone
    concept, like the Session Name), mirroring rename. On success the envelope carries the
    updated Session with its new ``is_favorite`` state."""

    session_view = sessions.get(session_id, clerk_user_id)
    if session_view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    if session_view.is_protocol_member:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A session inside a protocol can't be favorited.",
        )

    view = sessions.set_favorite(session_id, clerk_user_id, favorite)
    if view is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail="Session not found")
    return success_envelope(_serialize(view))


@router.post("/sessions/{session_id}/favorite")
def favorite_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    """Mark the owner's standalone Session as a Favorite (CONTEXT: Favorite, issue #396).

    The submit target of the standalone Session's Favorite toggle. Writes a stored, per-user,
    per-copy marker — private to the user, and never carried across Duplicate/Redeem (a copy
    is a new Session with no marker). Idempotent: marking an already-favorited Session is a
    no-op. Bodyless POST. ``404`` for a non-owner, ``409`` on a Protocol member (Favorite is
    standalone-only)."""

    return _set_favorite(session_id, clerk_user_id, True, sessions)


@router.delete("/sessions/{session_id}/favorite")
def unfavorite_session(
    session_id: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    """Unmark the owner's standalone Session as a Favorite — the mark's inverse (issue #396).

    Clears the owner's Favorite marker. Idempotent: unmarking an un-favorited Session is a
    no-op. Bodyless DELETE, so the seam sends no ``Content-Type`` (ADR-0022). Same surface as
    the mark: ``404`` for a non-owner, ``409`` on a Protocol member."""

    return _set_favorite(session_id, clerk_user_id, False, sessions)


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


class SchemeBody(BaseModel):
    """The Progression Scheme to select on a standalone Session's prescription (ADR-0064).

    ``scheme`` is one of the closed catalog's stored values; membership is validated at
    the boundary so an unknown value never reaches the service. Its *compatibility* with
    the movement's Load is the service's job, surfaced as a ``422`` rather than a body
    error, so an honest "this scheme doesn't apply here" reason reaches the client."""

    scheme: str = Field(min_length=1)

    @field_validator("scheme")
    @classmethod
    def _known_scheme(cls, value: str) -> str:
        if parse_scheme(value) is None:
            allowed = ", ".join(scheme.value for scheme in ProgressionScheme)
            raise ValueError(f"scheme must be one of: {allowed}")
        return value


@router.put("/sessions/{session_id}/prescriptions/{position}/scheme")
def choose_scheme(
    session_id: int,
    position: int,
    body: SchemeBody,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    """Select a Progression Scheme on the prescription at ``position`` in place (ADR-0064).

    The standalone-Session write path for choosing a movement's scheme — a no-AI plan edit,
    the same posture as Insert / Remove / Substitution. Delegates to ``set_scheme``, which
    guards before any write: a missing/non-owned Session or absent position ``404``s; a
    Protocol member ``409``s (its scheme is chosen on the Builder and committed via Deploy);
    and a scheme incompatible with the movement's Load ``422``s with a clear reason via the
    error envelope. On success the serialized Session — its chosen scheme now on the target
    prescription — is returned; the read-time overlay then progresses that movement by it.
    """

    try:
        scheme = ProgressionScheme(body.scheme)
        view = set_scheme(
            session_id, clerk_user_id, position, scheme, sessions=sessions
        )
    except (SchemeSessionNotFound, SchemePrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    except SchemeNotOnProtocolMember as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A protocol member's scheme is chosen through the builder.",
        ) from exc
    except IncompatibleScheme as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail="That progression scheme doesn't apply to this movement's load.",
        ) from exc
    return success_envelope(_serialize(view))


@router.delete("/sessions/{session_id}/prescriptions/{position}/scheme")
def clear_scheme_selection(
    session_id: int,
    position: int,
    clerk_user_id: str = Depends(get_current_user),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict:
    """Clear the Progression Scheme selection at ``position`` — ``choose_scheme``'s inverse.

    Restores the movement to the default (Double Progression) with no effect on past Logged
    Sessions or strength numbers (ADR-0064). Same error surface as ``choose_scheme`` minus
    the compatibility check (clearing is always legal): ``404`` for a missing/non-owned
    prescription, ``409`` on a Protocol member. Bodyless DELETE, so the seam sends no
    ``Content-Type`` (ADR-0022). Idempotent on an already-default prescription."""

    try:
        view = clear_scheme(session_id, clerk_user_id, position, sessions=sessions)
    except (SchemeSessionNotFound, SchemePrescriptionNotFound) as exc:
        raise HTTPException(
            status_code=HTTP_NOT_FOUND, detail="Prescription not found"
        ) from exc
    except SchemeNotOnProtocolMember as exc:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail="A protocol member's scheme is chosen through the builder.",
        ) from exc
    return success_envelope(_serialize(view))
