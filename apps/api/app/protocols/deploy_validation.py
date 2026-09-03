"""Deploy validation for the Protocol Builder (Module B, ADR-0020).

``DEPLOY PROTOCOL`` stages a whole edit client-side and commits it atomically; this
module is its single validation gate. ``validate_deploy`` turns the desired
un-performed tail (a pure ``DeployDraft``) into a typed list of everything wrong
with it, so a rejected deploy names the offending item(s) and persists nothing.

It is a pure function — no I/O. The two facts only the server can supply are passed
in: the set of **performed** Session ids (the frozen prefix that must never be
touched, ADR-0020) and the set of Session ids that actually belong to the Protocol;
Exercise existence is injected as a predicate so the shared catalog is never
imported here. Load is deliberately *not* validated: a qualitative or absent Load is
legitimate (ADR-0010).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from app.domain.load import ParsedLoad
from app.domain.progression import (
    parse_scheme,
    scheme_applies_to_optional_load,
)
from app.domain.superset import SupersetMember, validate_supersets

# The shape bounds mirror the generate endpoint's constants (a single source of
# truth lives here; ``routes/protocols.py`` imports these). ADR-0001 already allows
# weeks to differ per deload, so ``sessions_per_week`` is a soft header value, but
# both stay bounded to keep a plan sane.
MIN_SESSIONS_PER_WEEK = 1
MAX_SESSIONS_PER_WEEK = 14
MIN_WEEKS = 1
MAX_WEEKS = 52
MIN_SETS = 1


@dataclass(frozen=True)
class DraftPrescription:
    """One Exercise Prescription in the desired tail, referencing a catalog id."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: dict | None = None
    # Superset grouping (ADR-0023): both ``None`` for a flat, solo Prescription.
    superset_group: str | None = None
    round_rest_seconds: int | None = None
    # Progression Scheme selection (ADR-0064): a chosen scheme value, or ``None`` for the
    # inherited default (Double Progression). Validated for Load-kind compatibility below.
    scheme: str | None = None
    # Set Type annotation (ADR-0065, #449): a chosen ``SetType`` value, or ``None`` for
    # "unset" (reads as working). A descriptive label carried through Deploy re-numbered
    # untouched; it has no compatibility rule (independent of Load and Progression), so it
    # needs no validation here beyond the membership check at the request boundary.
    set_type: str | None = None
    # Exercise Note (ADR-0065, #451): the plan-side coaching cue, or ``None`` for "no note".
    # Already length-capped and HTML-escaped at the request boundary; carried through Deploy
    # re-numbered untouched, so it needs no validation here.
    note: str | None = None


@dataclass(frozen=True)
class DraftSession:
    """One Session in the desired tail. ``session_id`` names an existing Session it
    edits (``None`` for a not-yet-persisted new Session — a later slice)."""

    session_id: int | None
    week: int
    day: int
    prescriptions: list[DraftPrescription] = field(default_factory=list)


@dataclass(frozen=True)
class DeployDraft:
    """The desired un-performed tail plus the plan's shape, as sent to ``DEPLOY``."""

    weeks: int
    sessions_per_week: int
    sessions: list[DraftSession] = field(default_factory=list)


@dataclass(frozen=True)
class DeployError:
    """One reason a draft is rejected, located to the offending item where it has
    one. ``code`` is a stable machine tag; ``message`` is human-readable."""

    code: str
    message: str
    session_id: int | None = None
    position: int | None = None


def validate_deploy(
    draft: DeployDraft,
    *,
    performed_session_ids: set[int],
    known_session_ids: set[int],
    exercise_exists: Callable[[int], bool],
    has_sensitive_constraint: bool = False,
) -> list[DeployError]:
    """Return every reason ``draft`` cannot be deployed, or ``[]`` when it is safe.

    ``has_sensitive_constraint`` is threaded to the shared Superset validator (ADR-0023):
    a user with any Sensitive Constraint is never handed a Superset, so any group present
    is hard-rejected as ``superset_forbidden_under_sensitive_constraint``. This is the
    server-side backstop for both the Builder and the Hand-Authored build-and-log screen
    (issue #290), whose clients pause grouping up front.
    """

    errors: list[DeployError] = []

    if not MIN_WEEKS <= draft.weeks <= MAX_WEEKS:
        errors.append(
            DeployError(
                code="weeks_out_of_range",
                message=f"weeks must be between {MIN_WEEKS} and {MAX_WEEKS}.",
            )
        )

    if not MIN_SESSIONS_PER_WEEK <= draft.sessions_per_week <= MAX_SESSIONS_PER_WEEK:
        errors.append(
            DeployError(
                code="sessions_per_week_out_of_range",
                message=(
                    "sessions_per_week must be between "
                    f"{MIN_SESSIONS_PER_WEEK} and {MAX_SESSIONS_PER_WEEK}."
                ),
            )
        )

    if not draft.sessions:
        errors.append(
            DeployError(
                code="no_sessions",
                message="A Protocol must have at least one Session.",
            )
        )

    for session in draft.sessions:
        errors.extend(
            _session_errors(
                session,
                performed_session_ids,
                known_session_ids,
                exercise_exists,
                has_sensitive_constraint,
            )
        )

    return errors


def _session_errors(
    session: DraftSession,
    performed_session_ids: set[int],
    known_session_ids: set[int],
    exercise_exists: Callable[[int], bool],
    has_sensitive_constraint: bool,
) -> list[DeployError]:
    """Validate one draft Session in isolation."""

    errors: list[DeployError] = []

    if session.session_id is not None and session.session_id in performed_session_ids:
        errors.append(
            DeployError(
                code="performed_session_modified",
                message="A performed Session cannot be edited.",
                session_id=session.session_id,
            )
        )
    elif (
        session.session_id is not None
        and session.session_id not in known_session_ids
    ):
        errors.append(
            DeployError(
                code="unknown_session",
                message=f"Session {session.session_id} is not part of this Protocol.",
                session_id=session.session_id,
            )
        )

    if not session.prescriptions:
        errors.append(
            DeployError(
                code="empty_session",
                message="A Session must have at least one exercise.",
                session_id=session.session_id,
            )
        )

    for position, prescription in enumerate(session.prescriptions):
        errors.extend(
            _prescription_errors(
                prescription, session.session_id, position, exercise_exists
            )
        )

    errors.extend(_superset_errors(session, has_sensitive_constraint))

    return errors


def _superset_errors(
    session: DraftSession, has_sensitive_constraint: bool
) -> list[DeployError]:
    """Hard-reject any invalid Superset grouping in the Session, delegating to the
    shared validator (ADR-0023) so DEPLOY and generation agree on "what a valid
    Superset is". Each structural violation is located by Session id and the group's
    first member position; nothing is persisted on rejection."""

    members = [
        SupersetMember(
            position=position,
            superset_group=prescription.superset_group,
            sets=prescription.sets,
            round_rest_seconds=prescription.round_rest_seconds,
        )
        for position, prescription in enumerate(session.prescriptions)
    ]
    return [
        DeployError(
            code=violation.code,
            message=violation.message,
            session_id=session.session_id,
            position=violation.position,
        )
        for violation in validate_supersets(
            members, has_sensitive_constraint=has_sensitive_constraint
        )
    ]


def _prescription_errors(
    prescription: DraftPrescription,
    session_id: int | None,
    position: int,
    exercise_exists: Callable[[int], bool],
) -> list[DeployError]:
    """Validate one Prescription, locating each error by Session id and position."""

    errors: list[DeployError] = []

    if not exercise_exists(prescription.exercise_id):
        errors.append(
            DeployError(
                code="unknown_exercise",
                message=f"Exercise {prescription.exercise_id} is not in the catalog.",
                session_id=session_id,
                position=position,
            )
        )

    if prescription.sets < MIN_SETS:
        errors.append(
            DeployError(
                code="invalid_sets",
                message="A Prescription needs at least one set.",
                session_id=session_id,
                position=position,
            )
        )

    if not prescription.reps.strip():
        errors.append(
            DeployError(
                code="empty_reps",
                message="A Prescription needs a rep target.",
                session_id=session_id,
                position=position,
            )
        )

    errors.extend(_scheme_errors(prescription, session_id, position))

    return errors


def _scheme_errors(
    prescription: DraftPrescription,
    session_id: int | None,
    position: int,
) -> list[DeployError]:
    """Validate a chosen Progression Scheme against the Prescription's Load (ADR-0064).

    A ``None`` selection is the inherited default (Double Progression) and never an error.
    A non-null value must be a member of the closed catalog (else ``unknown_scheme``) and
    must be **compatible** with the Prescription's Load kind — a weight-axis scheme like
    Greyskull on a pure-bodyweight (or Load-less) movement has nothing to step and is
    rejected as ``incompatible_scheme`` rather than silently falling back (load-kind
    honesty). Located to the offending Prescription so the client can fix it in one pass.
    """

    if prescription.scheme is None:
        return []

    scheme = parse_scheme(prescription.scheme)
    if scheme is None:
        return [
            DeployError(
                code="unknown_scheme",
                message=f"'{prescription.scheme}' is not a known progression scheme.",
                session_id=session_id,
                position=position,
            )
        ]

    load = (
        ParsedLoad.from_dict(prescription.recommended_load)
        if prescription.recommended_load is not None
        else None
    )
    if not scheme_applies_to_optional_load(scheme, load):
        return [
            DeployError(
                code="incompatible_scheme",
                message=(
                    f"The {scheme.value} scheme does not apply to this movement's load."
                ),
                session_id=session_id,
                position=position,
            )
        ]

    return []


__all__ = [
    "MIN_SESSIONS_PER_WEEK",
    "MAX_SESSIONS_PER_WEEK",
    "MIN_WEEKS",
    "MAX_WEEKS",
    "MIN_SETS",
    "DraftPrescription",
    "DraftSession",
    "DeployDraft",
    "DeployError",
    "validate_deploy",
]
