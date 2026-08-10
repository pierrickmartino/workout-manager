"""The Hand-Authored Session create path: author a plan and log it in one submit.

A Hand-Authored Session is a Session a user builds by hand, with no AI call (ADR-0040).
``author_and_log_session`` is its single write path: it validates the whole request up
front — the performed date is not in the future, the authored prescriptions pass the
Builder's ``validate_deploy`` rules (ADR-0020/0023), and every performed set references a
real catalog Exercise — and, only when nothing is wrong, creates a standalone
``user_authored`` Session (the *plan*) and records its first Logged Session (the *record*)
by reusing the existing ``log_session`` service (ADR-0031).

Validation runs before any write, so a rejected request persists nothing (the acceptance
contract): the errors are returned as a list of ``DeployError`` — the same typed,
item-located shape the Protocol DEPLOY endpoint already speaks. Pure orchestration over
the repositories; no AI, no HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.domain.fitness_profile import is_sensitive
from app.domain.session_provenance import SessionProvenance
from app.logbook.service import LogSessionRequest, log_session
from app.protocols.deploy_validation import (
    DeployDraft,
    DeployError,
    DraftPrescription,
    DraftSession,
    validate_deploy,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
    LoggedSetDraft,
)
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import (
    PrescriptionDraft,
    SessionDraft,
    SessionRepository,
    SessionView,
)

# The single Session a Hand-Authored request authors is validated through the Protocol
# validator, which expects a plan header. A standalone Session is one Session in one
# "week" — these keep the shared validator happy without leaking Protocol shape outward.
_AUTHORED_WEEKS = 1
_AUTHORED_SESSIONS_PER_WEEK = 1


class AuthoredSessionInvalid(Exception):
    """The authored request is rejected; nothing was persisted.

    Carries the typed, item-located ``DeployError`` list so the boundary can surface a
    structured ``422`` naming every offending item, exactly like the DEPLOY endpoint.
    """

    def __init__(self, errors: list[DeployError]) -> None:
        self.errors = errors
        super().__init__(errors[0].message if errors else "Invalid session.")


@dataclass(frozen=True)
class AuthorPlanRequest:
    """A request to author a standalone plan with **no performance logged** (Capture,
    ADR-0044).

    The plan half of a Hand-Authored Session — ``prescriptions`` only, with no
    ``logged_sets`` and no ``performed_on``. Capture promotes an existing plan-less record
    into a reusable plan: the record already exists, so authoring must create the plan
    alone and never log a second performance (which would inflate every read-time
    projection — XP, Streak, records). ``duration_minutes`` is the plan's nominal length.
    """

    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)


@dataclass(frozen=True)
class AuthorSessionRequest:
    """A request to author-and-log a Hand-Authored Session in one submit.

    ``prescriptions`` are the authored *plan* (sets/reps/rest/tempo/typed Load), and
    ``logged_sets`` are the *record* of what was performed on ``performed_on`` (each a
    typed Quantity + typed Load + perceived difficulty). ``duration_minutes`` is the
    plan's nominal length; the record's actual training time is not measured for a
    log-after-the-fact performance (ADR-0014), so ``duration_seconds`` is never set here.
    """

    performed_on: date
    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)
    logged_sets: list[LoggedSetDraft] = field(default_factory=list)


def _deploy_draft(prescriptions: list[PrescriptionDraft]) -> DeployDraft:
    """Wrap authored prescriptions as the one-Session tail the Protocol validator expects —
    a standalone Session is one Session in one "week". Shared by the author-and-log path
    and the plan-only Capture path (ADR-0044), which validate the same plan shape."""

    return DeployDraft(
        weeks=_AUTHORED_WEEKS,
        sessions_per_week=_AUTHORED_SESSIONS_PER_WEEK,
        sessions=[
            DraftSession(
                session_id=None,
                week=1,
                day=1,
                prescriptions=[
                    DraftPrescription(
                        exercise_id=prescription.exercise_id,
                        sets=prescription.sets,
                        reps=prescription.reps,
                        rest_seconds=prescription.rest_seconds,
                        tempo=prescription.tempo,
                        recommended_load=prescription.recommended_load,
                        superset_group=prescription.superset_group,
                        round_rest_seconds=prescription.round_rest_seconds,
                    )
                    for prescription in prescriptions
                ],
            )
        ],
    )


def _validation_errors(
    request: AuthorSessionRequest,
    *,
    exercises: ExerciseRepository,
    has_sensitive_constraint: bool,
    today: date,
) -> list[DeployError]:
    """Every reason the request cannot be authored, or ``[]`` when it is safe to write.

    Reuses the Builder's ``validate_deploy`` for the plan (empty session, unknown
    Exercise, invalid sets/reps, Superset structure — with the Sensitive-Constraint
    suppression posture threaded, ADR-0023), and adds the record-side and date checks the
    standalone create path owns.
    """

    errors: list[DeployError] = []

    if request.performed_on > today:
        errors.append(
            DeployError(
                code="future_performed_on",
                message="The performed-on date cannot be in the future.",
            )
        )

    def exercise_exists(exercise_id: int) -> bool:
        return exercises.get(exercise_id) is not None

    errors.extend(
        validate_deploy(
            _deploy_draft(request.prescriptions),
            performed_session_ids=set(),
            known_session_ids=set(),
            exercise_exists=exercise_exists,
            has_sensitive_constraint=has_sensitive_constraint,
        )
    )

    # A performance must record at least one set — there is no "first Logged Session"
    # without one. Enforced here (not just at the HTTP boundary) so the service contract
    # holds for every caller.
    if not request.logged_sets:
        errors.append(
            DeployError(
                code="no_logged_sets",
                message="Record at least one set you performed.",
            )
        )

    # Every performed set must reference a real catalog Exercise before the write, so an
    # unknown one is rejected with nothing persisted rather than surfacing mid-transaction
    # from ``log_session``.
    for position, logged_set in enumerate(request.logged_sets):
        if not exercise_exists(logged_set.exercise_id):
            errors.append(
                DeployError(
                    code="unknown_exercise",
                    message=(
                        f"Exercise {logged_set.exercise_id} is not in the catalog."
                    ),
                    position=position,
                )
            )

    return errors


def author_and_log_session(
    request: AuthorSessionRequest,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    exercises: ExerciseRepository,
    logged: LoggedSessionRepository,
    profiles: ProfileRepository,
    today: date | None = None,
) -> LoggedSessionView:
    """Author a ``user_authored`` standalone Session and log its first performance.

    Validates the whole request first (``AuthoredSessionInvalid`` on any problem, with
    nothing written), then creates the plan and records its first Logged Session by
    reusing ``log_session`` — so the catalog-validity guard, the Performed-Body-Weight
    snapshot (ADR-0026), and the typed Load/Quantity boundaries are shared, not
    reimplemented. Returns the created Logged Session view.
    """

    profile = profiles.get_or_create(clerk_user_id)
    errors = _validation_errors(
        request,
        exercises=exercises,
        has_sensitive_constraint=is_sensitive(profile),
        today=today or date.today(),
    )
    if errors:
        raise AuthoredSessionInvalid(errors)

    session = sessions.create(
        clerk_user_id,
        SessionDraft(
            training_type=request.training_type,
            duration_minutes=request.duration_minutes,
            prescriptions=request.prescriptions,
            provenance=SessionProvenance.USER_AUTHORED.value,
        ),
    )

    # The record side reuses the existing logging service against the just-created
    # Session. Every rejectable condition (bad date, empty session, unknown Exercise on
    # either the plan or a performed set) is caught by the pre-validation above, so this
    # call cannot fail on validation and plan + record land together — nothing is
    # persisted on a rejected request. (True cross-write DB atomicity is bounded by the
    # repositories' own commit-per-write model, as with every multi-repo create here.)
    log_request = LogSessionRequest(
        session_id=session.id,
        performed_on=request.performed_on,
        logged_sets=request.logged_sets,
    )
    return log_session(
        log_request,
        clerk_user_id,
        sessions=sessions,
        exercises=exercises,
        logged=logged,
        profiles=profiles,
    )


def author_plan(
    request: AuthorPlanRequest,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    exercises: ExerciseRepository,
    profiles: ProfileRepository,
) -> SessionView:
    """Author a ``user_authored`` standalone Session (the plan) **without logging**
    (Capture, ADR-0044).

    Validates the plan through the Builder's ``validate_deploy`` rules (empty session,
    unknown Exercise, invalid sets/reps, Superset structure — with the Sensitive-Constraint
    suppression posture threaded, ADR-0023); on any problem raises ``AuthoredSessionInvalid``
    with nothing written. Then creates **only** the plan — no Logged Session — so Capture
    never fabricates a second performance of a workout the source record already captured,
    and no read-time projection is inflated. Returns the created Session view.
    """

    profile = profiles.get_or_create(clerk_user_id)

    def exercise_exists(exercise_id: int) -> bool:
        return exercises.get(exercise_id) is not None

    errors = validate_deploy(
        _deploy_draft(request.prescriptions),
        performed_session_ids=set(),
        known_session_ids=set(),
        exercise_exists=exercise_exists,
        has_sensitive_constraint=is_sensitive(profile),
    )
    if errors:
        raise AuthoredSessionInvalid(errors)

    return sessions.create(
        clerk_user_id,
        SessionDraft(
            training_type=request.training_type,
            duration_minutes=request.duration_minutes,
            prescriptions=request.prescriptions,
            provenance=SessionProvenance.USER_AUTHORED.value,
        ),
    )


__all__ = [
    "AuthoredSessionInvalid",
    "AuthorPlanRequest",
    "AuthorSessionRequest",
    "author_and_log_session",
    "author_plan",
]
